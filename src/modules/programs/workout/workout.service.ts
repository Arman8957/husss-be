// src/workout/workout.service.ts

import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';

import {
  StartWorkoutDto, LogSetDto, BulkLogSetsDto,
  StartRestTimerDto, CompleteWorkoutDto, WorkoutHistoryQueryDto,
} from './dto/workout.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class WorkoutService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Get Today's Workout ────────────────────────────────────────────────────
  async getTodaysWorkout(userId: string) {
    const active = await this.prisma.userActiveProgram.findUnique({
      where: { userId },
      include: {
        program: {
          include: {
            weeks: {
              orderBy: { weekNumber: 'asc' },
              include: {
                trainingMethods: { include: { trainingMethod: true } },
                days: {
                  orderBy: { dayNumber: 'asc' },
                  include: {
                    exercises: {
                      orderBy: { sortOrder: 'asc' },
                      include: {
                        exercise: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
                        sets: { orderBy: { setNumber: 'asc' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!active) {
      return null;
    }

    const currentWeekData = active.program.weeks.find(
      (w) => w.weekNumber === active.currentWeek,
    );
    if (!currentWeekData) return null;

    const currentDay = currentWeekData.days.find(
      (d) => d.dayNumber === active.currentDay,
    );
    if (!currentDay) return null;

    const trainingMethodForDay = currentWeekData.trainingMethods.find(
      (m) => m.dayType === currentDay.dayType,
    );

    // Check if there's already an in-progress log today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existingLog = await this.prisma.workoutLog.findFirst({
      where: {
        userId,
        programDayId: currentDay.id,
        scheduledDate: today,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });

    const mainExercises = currentDay.exercises.filter((e) => !e.isBFR && !e.isAbs);
    const bfrExercises = currentDay.exercises.filter((e) => e.isBFR);
    const absExercises = currentDay.exercises.filter((e) => e.isAbs);

    return {
      currentWeek: active.currentWeek,
      currentDay: active.currentDay,
      totalWeeks: active.program.durationWeeks,
      programName: active.program.name,
      dayName: currentDay.name,
      dayType: currentDay.dayType,
      trainingMethod: trainingMethodForDay?.trainingMethod ?? null,
      bfrEnabled: active.bfrEnabled,
      absWorkoutType: active.absWorkoutType,
      mainExercises,
      bfrExercises: active.bfrEnabled ? bfrExercises : [],
      absExercises,
      workoutLogId: existingLog?.id ?? null,
      workoutStatus: existingLog?.status ?? 'PENDING',
      programDayId: currentDay.id,
    };
  }

  // ─── Start Workout ──────────────────────────────────────────────────────────
  async startWorkout(userId: string, dto: StartWorkoutDto) {
    const active = await this.prisma.userActiveProgram.findUnique({ where: { userId } });
    if (!active) throw new NotFoundException('No active program. Please activate a program first.');

    const day = await this.prisma.programDay.findFirst({
      where: { id: dto.programDayId, programWeek: { programId: active.programId } },
      include: {
        programWeek: {
          include: {
            trainingMethods: { include: { trainingMethod: true } },
          },
        },
        exercises: {
          orderBy: { sortOrder: 'asc' },
          include: {
            exercise: true,
            sets: { orderBy: { setNumber: 'asc' } },
          },
        },
      },
    });
    if (!day) throw new NotFoundException(`Program day "${dto.programDayId}" not found`);

    const scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : new Date();
    scheduledDate.setHours(0, 0, 0, 0);

    // Resume if in-progress log exists
    const existingLog = await this.prisma.workoutLog.findFirst({
      where: { userId, programDayId: dto.programDayId, status: 'IN_PROGRESS' },
      include: { workoutSessions: { include: { setLogs: true } } },
    });
    if (existingLog) {
      return { resumed: true, workoutLog: existingLog };
    }

    const trainingMethodForDay = day.programWeek.trainingMethods.find(
      (m) => m.dayType === day.dayType,
    );

    const workoutLog = await this.prisma.$transaction(async (tx) => {
      const log = await tx.workoutLog.create({
        data: {
          userId,
          programDayId: day.id,
          programId: active.programId,
          weekNumber: active.currentWeek,
          dayNumber: active.currentDay,
          status: 'IN_PROGRESS',
          scheduledDate,
          startedAt: new Date(),
        },
      });

      // Create one session per day (could be extended to per-exercise)
      await tx.workoutSession.create({
        data: {
          workoutLogId: log.id,
          programDayId: day.id,
          trainingMethodId: trainingMethodForDay?.trainingMethodId ?? null,
          sortOrder: 0,
        },
      });

      return log;
    });

    const fullLog = await this.prisma.workoutLog.findUnique({
      where: { id: workoutLog.id },
      include: {
        workoutSessions: {
          include: { trainingMethod: true, setLogs: true },
        },
      },
    });

    return { resumed: false, workoutLog: fullLog };
  }

  // ─── Log Set ────────────────────────────────────────────────────────────────
  async logSet(userId: string, workoutLogId: string, dto: LogSetDto) {
    const log = await this.validateWorkoutLog(userId, workoutLogId);

    const session = await this.prisma.workoutSession.findFirst({
      where: { workoutLogId, id: dto.workoutSessionId },
    });
    if (!session) {
      throw new NotFoundException(`Session "${dto.workoutSessionId}" not found in this workout`);
    }

    // Idempotent upsert — re-logging same set updates it
    const setLog = await this.prisma.workoutSetLog.upsert({
      where: {
        // Fallback to findFirst since there's no compound unique on this model
        // We create a pseudo-id approach: check first then create/update
        id: await this.findSetLogId(dto.workoutSessionId, dto.exerciseId, dto.setNumber),
      },
      create: {
        workoutSessionId: dto.workoutSessionId,
        exerciseId: dto.exerciseId,
        setNumber: dto.setNumber,
        plannedReps: dto.plannedReps ?? null,
        actualReps: dto.actualReps ?? null,
        weight: dto.weight ?? null,
        weightUnit: dto.weightUnit ?? 'KG',
        isCompleted: dto.isCompleted ?? true,
        completionPercent: dto.completionPercent ?? 100,
        setType: dto.setType ?? 'NORMAL',
        notes: dto.notes ?? null,
      },
      update: {
        plannedReps: dto.plannedReps ?? undefined,
        actualReps: dto.actualReps ?? undefined,
        weight: dto.weight ?? undefined,
        weightUnit: dto.weightUnit ?? undefined,
        isCompleted: dto.isCompleted ?? undefined,
        completionPercent: dto.completionPercent ?? undefined,
        setType: dto.setType ?? undefined,
        notes: dto.notes ?? undefined,
      },
    });

    return setLog;
  }

  async bulkLogSets(userId: string, workoutLogId: string, dto: BulkLogSetsDto) {
    await this.validateWorkoutLog(userId, workoutLogId);

    const results = await Promise.all(
      dto.sets.map((s) => this.logSet(userId, workoutLogId, s)),
    );

    return { logged: results.length, sets: results };
  }

  // ─── Rest Timer ─────────────────────────────────────────────────────────────
  async startRestTimer(userId: string, workoutLogId: string, dto: StartRestTimerDto) {
    await this.validateWorkoutLog(userId, workoutLogId);

    const setLog = await this.prisma.workoutSetLog.findUnique({
      where: { id: dto.setLogId },
    });
    if (!setLog) throw new NotFoundException(`Set log "${dto.setLogId}" not found`);

    return this.prisma.workoutSetLog.update({
      where: { id: dto.setLogId },
      data: { restStartedAt: new Date(), restEndedAt: null },
    });
  }

  async endRestTimer(userId: string, workoutLogId: string, setLogId: string) {
    await this.validateWorkoutLog(userId, workoutLogId);

    const setLog = await this.prisma.workoutSetLog.findUnique({
      where: { id: setLogId },
    });
    if (!setLog) throw new NotFoundException(`Set log "${setLogId}" not found`);
    if (!setLog.restStartedAt) throw new BadRequestException('Rest timer was not started');

    const restEndedAt = new Date();
    const durationSeconds = Math.round(
      (restEndedAt.getTime() - setLog.restStartedAt.getTime()) / 1000,
    );

    return this.prisma.workoutSetLog.update({
      where: { id: setLogId },
      data: { restEndedAt },
    });
  }

  // ─── Complete Workout ────────────────────────────────────────────────────────
  async completeWorkout(userId: string, workoutLogId: string, dto: CompleteWorkoutDto) {
    const log = await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    const sessions = await this.prisma.workoutSession.findMany({
      where: { workoutLogId },
      include: { setLogs: true },
    });

    // Calculate total volume
    const totalVolume = sessions.reduce((total, session) => {
      return total + session.setLogs.reduce((sum, sl) => {
        const weight = sl.weight ?? 0;
        const reps = sl.actualReps ?? 0;
        return sum + weight * reps;
      }, 0);
    }, 0);

    const completedAt = new Date();
    const durationSeconds = log.startedAt
      ? Math.round((completedAt.getTime() - log.startedAt.getTime()) / 1000)
      : null;

    const active = await this.prisma.userActiveProgram.findUnique({ where: { userId } });
    if (!active) throw new NotFoundException('No active program found');

    const program = await this.prisma.program.findUnique({
      where: { id: active.programId },
      select: { durationWeeks: true, daysPerWeek: true },
    });
    if (!program) throw new NotFoundException('Program not found');

    await this.prisma.$transaction(async (tx) => {
      // Mark log complete
      await tx.workoutLog.update({
        where: { id: workoutLogId },
        data: {
          status: 'COMPLETED',
          completedAt,
          durationSeconds,
          totalVolume,
          notes: dto.notes ?? null,
        },
      });

      // Advance program progress
      let newDay = active.currentDay + 1;
      let newWeek = active.currentWeek;
      let programCompleted = false;

      if (newDay > program.daysPerWeek) {
        newDay = 1;
        newWeek = active.currentWeek + 1;
      }

      if (newWeek > program.durationWeeks) {
        // Program completed
        programCompleted = true;

        await tx.userProgram.updateMany({
          where: { userId, programId: active.programId, isCompleted: false },
          data: {
            isCompleted: true,
            completedAt,
            completedWeeks: program.durationWeeks,
          },
        });

        await tx.userActivityLog.create({
          data: {
            userId,
            type: 'COMPLETED_PROGRAM',
            meta: { programId: active.programId },
          },
        });

        await tx.programAnalytics.updateMany({
          where: { programId: active.programId },
          data: { completedCount: { increment: 1 }, activeEnrollments: { decrement: 1 } },
        });
      } else {
        await tx.userActiveProgram.update({
          where: { userId },
          data: { currentDay: newDay, currentWeek: newWeek },
        });
      }

      // Update user stats
      await tx.user.update({
        where: { id: userId },
        data: {
          totalWorkouts: { increment: 1 },
          lastActiveDate: completedAt,
        },
      });

      // Update streak
      await this.updateStreak(tx, userId, completedAt);

      // Log activity
      await tx.userActivityLog.create({
        data: {
          userId,
          type: 'COMPLETED_WORKOUT',
          meta: {
            workoutLogId,
            totalVolume,
            durationSeconds,
            programCompleted,
          },
        },
      });
    });

    return this.prisma.workoutLog.findUnique({
      where: { id: workoutLogId },
      include: { workoutSessions: { include: { setLogs: true } } },
    });
  }

  async skipWorkout(userId: string, workoutLogId: string) {
    const log = await this.validateWorkoutLog(userId, workoutLogId);

    if (!['PENDING', 'IN_PROGRESS'].includes(log.status)) {
      throw new BadRequestException(`Cannot skip a ${log.status} workout`);
    }

    const active = await this.prisma.userActiveProgram.findUnique({ where: { userId } });
    if (!active) throw new NotFoundException('No active program');

    const program = await this.prisma.program.findUnique({
      where: { id: active.programId },
      select: { durationWeeks: true, daysPerWeek: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.workoutLog.update({
        where: { id: workoutLogId },
        data: { status: 'SKIPPED' },
      });

      // Still advance the program position
      let newDay = active.currentDay + 1;
      let newWeek = active.currentWeek;
      if (newDay > (program?.daysPerWeek ?? 3)) {
        newDay = 1;
        newWeek++;
      }
      if (newWeek <= (program?.durationWeeks ?? 10)) {
        await tx.userActiveProgram.update({
          where: { userId },
          data: { currentDay: newDay, currentWeek: newWeek },
        });
      }
    });

    return { success: true, message: 'Workout skipped. Program advanced to next day.' };
  }

  async getWorkoutLog(userId: string, workoutLogId: string) {
    const log = await this.prisma.workoutLog.findFirst({
      where: { id: workoutLogId, userId },
      include: {
        workoutSessions: {
          include: {
            trainingMethod: true,
            setLogs: {
              orderBy: [{ exerciseId: 'asc' }, { setNumber: 'asc' }],
              include: { exercise: { include: { media: true } } },
            },
          },
        },
      },
    });
    if (!log) throw new NotFoundException(`Workout log "${workoutLogId}" not found`);
    return log;
  }

  async getWorkoutHistory(userId: string, query: WorkoutHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.workoutLog.findMany({
        where: { userId, status: { in: ['COMPLETED', 'SKIPPED'] } },
        orderBy: { scheduledDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          workoutSessions: {
            include: {
              setLogs: { select: { weight: true, actualReps: true, isCompleted: true } },
            },
          },
        },
      }),
      this.prisma.workoutLog.count({
        where: { userId, status: { in: ['COMPLETED', 'SKIPPED'] } },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async validateWorkoutLog(userId: string, logId: string, allowedStatuses?: string[]) {
    const log = await this.prisma.workoutLog.findFirst({
      where: { id: logId, userId },
    });
    if (!log) throw new NotFoundException(`Workout log "${logId}" not found`);
    if (allowedStatuses && !allowedStatuses.includes(log.status)) {
      throw new BadRequestException(`Workout is ${log.status}, cannot perform this action`);
    }
    return log;
  }

  private async findSetLogId(
    sessionId: string,
    exerciseId: string,
    setNumber: number,
  ): Promise<string> {
    const existing = await this.prisma.workoutSetLog.findFirst({
      where: { workoutSessionId: sessionId, exerciseId, setNumber },
      select: { id: true },
    });
    // Return a non-existent ID if not found (triggers 'create' branch in upsert)
    return existing?.id ?? 'not-found-create-new';
  }

  private async updateStreak(tx: any, userId: string, now: Date) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { streakDays: true, lastActiveDate: true },
    });
    if (!user) return;

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    if (!user.lastActiveDate) {
      await tx.user.update({ where: { id: userId }, data: { streakDays: 1 } });
      return;
    }

    const last = new Date(user.lastActiveDate);
    last.setHours(0, 0, 0, 0);

    const diffDays = Math.round((today.getTime() - last.getTime()) / 86400000);

    let newStreak = user.streakDays;
    if (diffDays === 0) {
      // Same day, no change
    } else if (diffDays === 1) {
      newStreak = user.streakDays + 1;
    } else {
      newStreak = 1; // Reset
    }

    await tx.user.update({ where: { id: userId }, data: { streakDays: newStreak } });
  }
}