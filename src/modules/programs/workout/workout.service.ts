// src/workout/workout.service.ts

import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import {
  StartWorkoutDto, LogSetDto, BulkLogSetsDto, StartRestTimerDto,
  CompleteWorkoutDto, WorkoutHistoryQueryDto,
  UpdateSetLogDto, UpdateWorkoutLogDto,
} from './dto/workout.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class WorkoutService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Get Today's Workout ────────────────────────────────────────────────────
  //
  // FIX: Always returns a real workoutLogId (never null).
  // Creates a PENDING log on first call so client has an ID immediately.
  // Subsequent calls return the same PENDING/IN_PROGRESS log.
  //
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

    if (!active) return null;

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Always guarantee a workoutLogId ───────────────────────────────────────
    // Look for any active (non-terminal) log for today
    let workoutLog = await this.prisma.workoutLog.findFirst({
      where: {
        userId,
        programDayId:  currentDay.id,
        scheduledDate: today,
        status:        { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });

    // None found → create PENDING log so client has an ID from the very first call
    if (!workoutLog) {
      workoutLog = await this.prisma.workoutLog.create({
        data: {
          userId,
          programDayId:  currentDay.id,
          programId:     active.programId,
          weekNumber:    active.currentWeek,
          dayNumber:     active.currentDay,
          status:        'PENDING',
          scheduledDate: today,
        },
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const mainExercises = currentDay.exercises.filter((e) => !e.isBFR && !e.isAbs);
    const bfrExercises  = currentDay.exercises.filter((e) => e.isBFR);
    const absExercises  = currentDay.exercises.filter((e) => e.isAbs);

    return {
      // Progress
      currentWeek:    active.currentWeek,
      currentDay:     active.currentDay,
      totalWeeks:     active.program.durationWeeks,
      // Program info
      programName:    active.program.name,
      dayName:        currentDay.name,
      dayType:        currentDay.dayType,
      muscleGroups:   (currentDay as any).muscleGroups ?? [],
      trainingMethod: trainingMethodForDay?.trainingMethod ?? null,
      // User preferences
      bfrEnabled:     active.bfrEnabled,
      absWorkoutType: active.absWorkoutType,
      // Exercises
      mainExercises,
      bfrExercises:   active.bfrEnabled ? bfrExercises : [],
      absExercises,
      // ── Always a real ID — client uses this for ALL subsequent calls ─────────
      workoutLogId:  workoutLog.id,      // never null
      workoutStatus: workoutLog.status,  // 'PENDING' | 'IN_PROGRESS'
      programDayId:  currentDay.id,
    };
  }

  // ─── Start Workout ──────────────────────────────────────────────────────────
  //
  // Transitions the PENDING log (from getTodaysWorkout) → IN_PROGRESS
  // and creates a WorkoutSession.
  // If called without getTodaysWorkout first, creates the log fresh.
  // Resumes if already IN_PROGRESS.
  //
  async startWorkout(userId: string, dto: StartWorkoutDto) {
    const active = await this.prisma.userActiveProgram.findUnique({ where: { userId } });
    if (!active) {
      throw new NotFoundException('No active program. Please activate a program first.');
    }

    const day = await this.prisma.programDay.findFirst({
      where: { id: dto.programDayId, programWeek: { programId: active.programId } },
      include: {
        programWeek: {
          include: { trainingMethods: { include: { trainingMethod: true } } },
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

    // Resume if already IN_PROGRESS
    const inProgressLog = await this.prisma.workoutLog.findFirst({
      where:   { userId, programDayId: dto.programDayId, status: 'IN_PROGRESS' },
      include: { workoutSessions: { include: { trainingMethod: true, setLogs: true } } },
    });
    if (inProgressLog) {
      return { resumed: true, workoutLog: inProgressLog };
    }

    const trainingMethodForDay = day.programWeek.trainingMethods.find(
      (m) => m.dayType === day.dayType,
    );

    const scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : new Date();
    scheduledDate.setHours(0, 0, 0, 0);

    // Promote existing PENDING log → IN_PROGRESS, or create fresh
    const pendingLog = await this.prisma.workoutLog.findFirst({
      where: { userId, programDayId: dto.programDayId, status: 'PENDING' },
    });

    const workoutLog = await this.prisma.$transaction(async (tx) => {
      let log;

      if (pendingLog) {
        // Promote PENDING → IN_PROGRESS (same ID, client doesn't need to update)
        log = await tx.workoutLog.update({
          where: { id: pendingLog.id },
          data:  { status: 'IN_PROGRESS', startedAt: new Date() },
        });
      } else {
        log = await tx.workoutLog.create({
          data: {
            userId,
            programDayId:  day.id,
            programId:     active.programId,
            weekNumber:    active.currentWeek,
            dayNumber:     active.currentDay,
            status:        'IN_PROGRESS',
            scheduledDate,
            startedAt:     new Date(),
          },
        });
      }

      await tx.workoutSession.create({
        data: {
          workoutLogId:     log.id,
          programDayId:     day.id,
          trainingMethodId: trainingMethodForDay?.trainingMethodId ?? null,
          sortOrder:        0,
        },
      });

      return log;
    });

    const fullLog = await this.prisma.workoutLog.findUnique({
      where:   { id: workoutLog.id },
      include: { workoutSessions: { include: { trainingMethod: true, setLogs: true } } },
    });

    return { resumed: false, workoutLog: fullLog };
  }

  // ─── Log Set ────────────────────────────────────────────────────────────────

  async logSet(userId: string, workoutLogId: string, dto: LogSetDto) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    const session = await this.prisma.workoutSession.findFirst({
      where: { workoutLogId, id: dto.workoutSessionId },
    });
    if (!session) {
      throw new NotFoundException(`Session "${dto.workoutSessionId}" not found in this workout`);
    }

    const existingId = await this.findSetLogId(dto.workoutSessionId, dto.exerciseId, dto.setNumber);

    return this.prisma.workoutSetLog.upsert({
      where:  { id: existingId },
      create: {
        workoutSessionId:  dto.workoutSessionId,
        exerciseId:        dto.exerciseId,
        setNumber:         dto.setNumber,
        plannedReps:       dto.plannedReps       ?? null,
        actualReps:        dto.actualReps         ?? null,
        weight:            dto.weight             ?? null,
        weightUnit:        dto.weightUnit         ?? 'KG',
        isCompleted:       dto.isCompleted        ?? true,
        completionPercent: dto.completionPercent  ?? 100,
        setType:           dto.setType            ?? 'NORMAL',
        notes:             dto.notes              ?? null,
      },
      update: {
        plannedReps:       dto.plannedReps        !== undefined ? dto.plannedReps       : undefined,
        actualReps:        dto.actualReps          !== undefined ? dto.actualReps        : undefined,
        weight:            dto.weight              !== undefined ? dto.weight            : undefined,
        weightUnit:        dto.weightUnit          !== undefined ? dto.weightUnit        : undefined,
        isCompleted:       dto.isCompleted         !== undefined ? dto.isCompleted       : undefined,
        completionPercent: dto.completionPercent   !== undefined ? dto.completionPercent : undefined,
        setType:           dto.setType             !== undefined ? dto.setType           : undefined,
        notes:             dto.notes               !== undefined ? dto.notes             : undefined,
      },
    });
  }

  async bulkLogSets(userId: string, workoutLogId: string, dto: BulkLogSetsDto) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);
    const results = await Promise.all(
      dto.sets.map((s) => this.logSet(userId, workoutLogId, s)),
    );
    return { logged: results.length, sets: results };
  }

  // ─── Edit Set Log ← NEW ─────────────────────────────────────────────────────
  // PATCH /workout/:logId/sets/:setLogId
  // Correct a logged set (weight, reps, notes).
  // Only while workout is IN_PROGRESS.
  //
  async updateSetLog(
    userId: string,
    workoutLogId: string,
    setLogId: string,
    dto: UpdateSetLogDto,
  ) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    // Verify set belongs to this workout log
    const setLog = await this.prisma.workoutSetLog.findFirst({
      where: { id: setLogId, workoutSession: { workoutLogId } },
    });
    if (!setLog) {
      throw new NotFoundException(
        `Set log "${setLogId}" not found in workout "${workoutLogId}"`,
      );
    }

    return this.prisma.workoutSetLog.update({
      where: { id: setLogId },
      data: {
        ...(dto.actualReps        !== undefined && { actualReps:        dto.actualReps }),
        ...(dto.plannedReps       !== undefined && { plannedReps:       dto.plannedReps }),
        ...(dto.weight            !== undefined && { weight:            dto.weight }),
        ...(dto.weightUnit        !== undefined && { weightUnit:        dto.weightUnit }),
        ...(dto.isCompleted       !== undefined && { isCompleted:       dto.isCompleted }),
        ...(dto.completionPercent !== undefined && { completionPercent: dto.completionPercent }),
        ...(dto.setType           !== undefined && { setType:           dto.setType }),
        ...(dto.notes             !== undefined && { notes:             dto.notes }),
      },
    });
  }

  // ─── Delete Set Log ← NEW ───────────────────────────────────────────────────
  // DELETE /workout/:logId/sets/:setLogId
  // Remove a wrongly logged set.
  // Only while workout is IN_PROGRESS.
  //
  async deleteSetLog(userId: string, workoutLogId: string, setLogId: string) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    const setLog = await this.prisma.workoutSetLog.findFirst({
      where: { id: setLogId, workoutSession: { workoutLogId } },
    });
    if (!setLog) {
      throw new NotFoundException(
        `Set log "${setLogId}" not found in workout "${workoutLogId}"`,
      );
    }

    await this.prisma.workoutSetLog.delete({ where: { id: setLogId } });
    return { success: true, message: 'Set deleted' };
  }

  // ─── Edit Workout Notes ← NEW ────────────────────────────────────────────────
  // PATCH /workout/:logId/notes
  // Edit notes on any log regardless of status.
  //
  async updateWorkoutLog(userId: string, workoutLogId: string, dto: UpdateWorkoutLogDto) {
    await this.validateWorkoutLog(userId, workoutLogId);

    return this.prisma.workoutLog.update({
      where: { id: workoutLogId },
      data:  { ...(dto.notes !== undefined && { notes: dto.notes }) },
      include: {
        workoutSessions: { include: { trainingMethod: true, setLogs: true } },
      },
    });
  }

  // ─── Cancel Workout ← NEW ───────────────────────────────────────────────────
  // DELETE /workout/:logId
  // Cancel a PENDING or IN_PROGRESS workout.
  // Deletes log + all sessions + all set logs.
  // Does NOT advance program — use skip for that.
  //
  async cancelWorkout(userId: string, workoutLogId: string) {
    const log = await this.validateWorkoutLog(userId, workoutLogId);

    if (!['PENDING', 'IN_PROGRESS'].includes(log.status)) {
      throw new BadRequestException(
        `Cannot cancel a ${log.status} workout. ` +
        `Only PENDING and IN_PROGRESS workouts can be cancelled.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.workoutSession.findMany({
        where:  { workoutLogId },
        select: { id: true },
      });

      if (sessions.length) {
        await tx.workoutSetLog.deleteMany({
          where: { workoutSessionId: { in: sessions.map((s) => s.id) } },
        });
        await tx.workoutSession.deleteMany({ where: { workoutLogId } });
      }

      await tx.workoutLog.delete({ where: { id: workoutLogId } });
    });

    return { success: true, message: 'Workout cancelled and removed' };
  }

  // ─── Rest Timer ─────────────────────────────────────────────────────────────

  async startRestTimer(userId: string, workoutLogId: string, dto: StartRestTimerDto) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    const setLog = await this.prisma.workoutSetLog.findUnique({
      where: { id: dto.setLogId },
    });
    if (!setLog) throw new NotFoundException(`Set log "${dto.setLogId}" not found`);

    return this.prisma.workoutSetLog.update({
      where: { id: dto.setLogId },
      data:  { restStartedAt: new Date(), restEndedAt: null },
    });
  }

  async endRestTimer(userId: string, workoutLogId: string, setLogId: string) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    const setLog = await this.prisma.workoutSetLog.findUnique({
      where: { id: setLogId },
    });
    if (!setLog)             throw new NotFoundException(`Set log "${setLogId}" not found`);
    if (!setLog.restStartedAt) throw new BadRequestException('Rest timer was not started');

    return this.prisma.workoutSetLog.update({
      where: { id: setLogId },
      data:  { restEndedAt: new Date() },
    });
  }

  // ─── Complete Workout ────────────────────────────────────────────────────────

  async completeWorkout(userId: string, workoutLogId: string, dto: CompleteWorkoutDto) {
    const log = await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    const sessions = await this.prisma.workoutSession.findMany({
      where:   { workoutLogId },
      include: { setLogs: true },
    });

    const totalVolume = sessions.reduce((total, session) =>
      total + session.setLogs.reduce(
        (sum, sl) => sum + (sl.weight ?? 0) * (sl.actualReps ?? 0), 0,
      ), 0,
    );

    const completedAt     = new Date();
    const durationSeconds = log.startedAt
      ? Math.round((completedAt.getTime() - log.startedAt.getTime()) / 1000)
      : null;

    const active = await this.prisma.userActiveProgram.findUnique({ where: { userId } });
    if (!active) throw new NotFoundException('No active program found');

    const program = await this.prisma.program.findUnique({
      where:  { id: active.programId },
      select: { durationWeeks: true, daysPerWeek: true },
    });
    if (!program) throw new NotFoundException('Program not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.workoutLog.update({
        where: { id: workoutLogId },
        data:  {
          status: 'COMPLETED', completedAt, durationSeconds, totalVolume,
          notes:  dto.notes ?? null,
        },
      });

      let newDay  = active.currentDay + 1;
      let newWeek = active.currentWeek;
      let programCompleted = false;

      if (newDay > program.daysPerWeek) {
        newDay  = 1;
        newWeek = active.currentWeek + 1;
      }

      if (newWeek > program.durationWeeks) {
        programCompleted = true;
        await tx.userProgram.updateMany({
          where: { userId, programId: active.programId, isCompleted: false },
          data:  { isCompleted: true, completedAt, completedWeeks: program.durationWeeks },
        });
        await tx.userActivityLog.create({
          data: { userId, type: 'COMPLETED_PROGRAM', meta: { programId: active.programId } },
        });
        await tx.programAnalytics.updateMany({
          where: { programId: active.programId },
          data:  { completedCount: { increment: 1 }, activeEnrollments: { decrement: 1 } },
        });
      } else {
        await tx.userActiveProgram.update({
          where: { userId },
          data:  { currentDay: newDay, currentWeek: newWeek },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data:  { totalWorkouts: { increment: 1 }, lastActiveDate: completedAt },
      });

      await this.updateStreak(tx, userId, completedAt);

      await tx.userActivityLog.create({
        data: {
          userId,
          type: 'COMPLETED_WORKOUT',
          meta: { workoutLogId, totalVolume, durationSeconds, programCompleted },
        },
      });
    });

    return this.prisma.workoutLog.findUnique({
      where:   { id: workoutLogId },
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
      where:  { id: active.programId },
      select: { durationWeeks: true, daysPerWeek: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.workoutLog.update({
        where: { id: workoutLogId },
        data:  { status: 'SKIPPED' },
      });

      let newDay  = active.currentDay + 1;
      let newWeek = active.currentWeek;

      if (newDay > (program?.daysPerWeek ?? 3)) {
        newDay = 1;
        newWeek++;
      }
      if (newWeek <= (program?.durationWeeks ?? 10)) {
        await tx.userActiveProgram.update({
          where: { userId },
          data:  { currentDay: newDay, currentWeek: newWeek },
        });
      }
    });

    return { success: true, message: 'Workout skipped. Program advanced to next day.' };
  }

  // ─── Get Log / History ───────────────────────────────────────────────────────

  async getWorkoutLog(userId: string, workoutLogId: string) {
    const log = await this.prisma.workoutLog.findFirst({
      where:   { id: workoutLogId, userId },
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
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.workoutLog.findMany({
        where:   { userId, status: { in: ['COMPLETED', 'SKIPPED'] } },
        orderBy: { scheduledDate: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
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

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async validateWorkoutLog(userId: string, logId: string, allowedStatuses?: string[]) {
    const log = await this.prisma.workoutLog.findFirst({
      where: { id: logId, userId },
    });
    if (!log) throw new NotFoundException(`Workout log "${logId}" not found`);
    if (allowedStatuses && !allowedStatuses.includes(log.status)) {
      throw new BadRequestException(
        `Workout is ${log.status}. Allowed for this action: [${allowedStatuses.join(', ')}]`,
      );
    }
    return log;
  }

  private async findSetLogId(
    sessionId: string,
    exerciseId: string,
    setNumber: number,
  ): Promise<string> {
    const existing = await this.prisma.workoutSetLog.findFirst({
      where:  { workoutSessionId: sessionId, exerciseId, setNumber },
      select: { id: true },
    });
    return existing?.id ?? 'not-found-create-new';
  }

  private async updateStreak(tx: any, userId: string, now: Date) {
    const user = await tx.user.findUnique({
      where:  { id: userId },
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
    if      (diffDays === 0) { /* same day — no change */ }
    else if (diffDays === 1) { newStreak = user.streakDays + 1; }
    else                     { newStreak = 1; }

    await tx.user.update({ where: { id: userId }, data: { streakDays: newStreak } });
  }
}