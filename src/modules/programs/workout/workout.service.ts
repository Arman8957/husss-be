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

// ─── Shared exercise include (reused in all day fetches) ──────────────────────
const EXERCISE_INCLUDE = {
  orderBy: { sortOrder: 'asc' as const },
  include: {
    exercise: { include: { media: { orderBy: { sortOrder: 'asc' as const } } } },
    sets: { orderBy: { setNumber: 'asc' as const } },
  },
};

@Injectable()
export class WorkoutService {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════
  // GET TODAY'S WORKOUT
  // ═══════════════════════════════════════════════════════════════
  // Loads ONLY the current week + day (not all weeks — efficient).
  // Always returns a real workoutLogId (PENDING created on first call).
  //
  async getTodaysWorkout(userId: string) {
    const active = await this.prisma.userActiveProgram.findUnique({
      where:  { userId },
      select: {
        programId:      true,
        currentWeek:    true,
        currentDay:     true,
        bfrEnabled:     true,
        absWorkoutType: true,
        program: { select: { name: true, durationWeeks: true } },
      },
    });
    if (!active) return null;

    // Fetch ONLY the current week + current day
    const week = await this.prisma.programWeek.findFirst({
      where: { programId: active.programId, weekNumber: active.currentWeek },
      include: {
        trainingMethods: { include: { trainingMethod: true } },
        days: {
          where:   { dayNumber: active.currentDay },
          include: { exercises: EXERCISE_INCLUDE },
        },
      },
    });
    if (!week) return null;

    const currentDay = week.days[0];
    if (!currentDay) return null;

    const trainingMethodForDay = week.trainingMethods.find(
      (m) => m.dayType === currentDay.dayType,
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find or create PENDING log — always return a real ID
    let workoutLog = await this.prisma.workoutLog.findFirst({
      where: {
        userId,
        programDayId:  currentDay.id,
        scheduledDate: today,
        status:        { in: ['PENDING', 'IN_PROGRESS'] },
      },
      select: { id: true, status: true },
    });

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
        select: { id: true, status: true },
      });
    }

    return this.buildDayResponse({
      day:                  currentDay,
      week,
      bfrEnabled:           active.bfrEnabled,
      absWorkoutType:       active.absWorkoutType,
      trainingMethodForDay,
      workoutLogId:         workoutLog.id,
      workoutStatus:        workoutLog.status,
      weekNumber:           active.currentWeek,
      dayNumber:            active.currentDay,
      currentWeek:          active.currentWeek,
      currentDay:           active.currentDay,
      totalWeeks:           active.program.durationWeeks,
      programName:          active.program.name,
      programId:            active.programId,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // GET SINGLE SPECIFIC DAY
  // ═══════════════════════════════════════════════════════════════
  // FIXED: requires programId — weeks/days are scoped per program.
  // Route: GET /workout/programs/:programId/day/:weekNumber/:dayNumber
  //
  async getWorkoutDay(
    userId: string,
    programId: string,
    weekNumber: number,
    dayNumber: number,
  ) {
    // Verify user is enrolled in or actively running this program
    const [active, enrollment] = await Promise.all([
      this.prisma.userActiveProgram.findUnique({
        where:  { userId },
        select: { programId: true, currentWeek: true, currentDay: true, bfrEnabled: true, absWorkoutType: true },
      }),
      this.prisma.userProgram.findFirst({
        where:  { userId, programId, isCompleted: false },
        select: { id: true },
      }),
    ]);

    const isActiveProgram = active?.programId === programId;
    if (!isActiveProgram && !enrollment) {
      throw new NotFoundException(`Program "${programId}" not found or not enrolled`);
    }

    // Fetch program meta + ONLY the requested week + day
    const [program, week] = await Promise.all([
      this.prisma.program.findUnique({
        where:  { id: programId },
        select: { name: true, durationWeeks: true },
      }),
      this.prisma.programWeek.findFirst({
        where: { programId, weekNumber },
        include: {
          trainingMethods: { include: { trainingMethod: true } },
          days: {
            where:   { dayNumber },
            include: { exercises: EXERCISE_INCLUDE },
          },
        },
      }),
    ]);

    if (!program) throw new NotFoundException(`Program "${programId}" not found`);
    if (!week) {
      throw new NotFoundException(
        `Week ${weekNumber} not found in program "${program.name}"`,
      );
    }

    const day = week.days[0];
    if (!day) {
      throw new NotFoundException(
        `Day ${dayNumber} not found in week ${weekNumber} of program "${program.name}"`,
      );
    }

    const trainingMethodForDay = week.trainingMethods.find(
      (m) => m.dayType === day.dayType,
    );

    // Find existing log for this day (most recent if re-done)
    const existingLog = await this.prisma.workoutLog.findFirst({
      where:   { userId, programDayId: day.id, programId },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, status: true },
    });

    return this.buildDayResponse({
      day,
      week,
      bfrEnabled:           active?.bfrEnabled     ?? false,
      absWorkoutType:       active?.absWorkoutType  ?? null,
      trainingMethodForDay,
      workoutLogId:         existingLog?.id     ?? null,
      workoutStatus:        existingLog?.status ?? null,
      weekNumber,
      dayNumber,
      currentWeek:          active?.currentWeek ?? 0,
      currentDay:           active?.currentDay  ?? 0,
      totalWeeks:           program.durationWeeks,
      programName:          program.name,
      programId,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // START WORKOUT
  // ═══════════════════════════════════════════════════════════════

  async startWorkout(userId: string, dto: StartWorkoutDto) {
    const active = await this.prisma.userActiveProgram.findUnique({
      where:  { userId },
      select: { programId: true, currentWeek: true, currentDay: true },
    });
    if (!active) {
      throw new NotFoundException('No active program. Please activate a program first.');
    }

    const day = await this.prisma.programDay.findFirst({
      where: { id: dto.programDayId, programWeek: { programId: active.programId } },
      include: {
        programWeek: { include: { trainingMethods: { include: { trainingMethod: true } } } },
      },
    });
    if (!day) throw new NotFoundException(`Program day "${dto.programDayId}" not found in active program`);

    // Resume if already IN_PROGRESS
    const inProgressLog = await this.prisma.workoutLog.findFirst({
      where:   { userId, programDayId: dto.programDayId, status: 'IN_PROGRESS' },
      include: { workoutSessions: { include: { trainingMethod: true, setLogs: true } } },
    });
    if (inProgressLog) return { resumed: true, workoutLog: inProgressLog };

    const trainingMethodForDay = day.programWeek.trainingMethods.find(
      (m) => m.dayType === day.dayType,
    );

    const scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : new Date();
    scheduledDate.setHours(0, 0, 0, 0);

    // Promote existing PENDING log → IN_PROGRESS (same ID — client doesn't need to refresh)
    const pendingLog = await this.prisma.workoutLog.findFirst({
      where:  { userId, programDayId: dto.programDayId, status: 'PENDING' },
      select: { id: true },
    });

    const workoutLog = await this.prisma.$transaction(async (tx) => {
      const log = pendingLog
        ? await tx.workoutLog.update({
            where: { id: pendingLog.id },
            data:  { status: 'IN_PROGRESS', startedAt: new Date() },
          })
        : await tx.workoutLog.create({
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

  // ═══════════════════════════════════════════════════════════════
  // LOG SET
  // ═══════════════════════════════════════════════════════════════

  async logSet(userId: string, workoutLogId: string, dto: LogSetDto) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    const session = await this.prisma.workoutSession.findFirst({
      where: { workoutLogId, id: dto.workoutSessionId },
    });
    if (!session) throw new NotFoundException(`Session "${dto.workoutSessionId}" not found in this workout`);

    const existingId = await this.findSetLogId(dto.workoutSessionId, dto.exerciseId, dto.setNumber);

    return this.prisma.workoutSetLog.upsert({
      where:  { id: existingId },
      create: {
        workoutSessionId:  dto.workoutSessionId,
        exerciseId:        dto.exerciseId,
        setNumber:         dto.setNumber,
        plannedReps:       dto.plannedReps      ?? null,
        actualReps:        dto.actualReps        ?? null,
        weight:            dto.weight            ?? null,
        weightUnit:        dto.weightUnit        ?? 'KG',
        isCompleted:       dto.isCompleted       ?? true,
        completionPercent: dto.completionPercent ?? 100,
        setType:           dto.setType           ?? 'NORMAL',
        notes:             dto.notes             ?? null,
      },
      update: {
        ...(dto.plannedReps       !== undefined && { plannedReps:       dto.plannedReps }),
        ...(dto.actualReps        !== undefined && { actualReps:        dto.actualReps }),
        ...(dto.weight            !== undefined && { weight:            dto.weight }),
        ...(dto.weightUnit        !== undefined && { weightUnit:        dto.weightUnit }),
        ...(dto.isCompleted       !== undefined && { isCompleted:       dto.isCompleted }),
        ...(dto.completionPercent !== undefined && { completionPercent: dto.completionPercent }),
        ...(dto.setType           !== undefined && { setType:           dto.setType }),
        ...(dto.notes             !== undefined && { notes:             dto.notes }),
      },
    });
  }

  async bulkLogSets(userId: string, workoutLogId: string, dto: BulkLogSetsDto) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);
    const results = await Promise.all(dto.sets.map((s) => this.logSet(userId, workoutLogId, s)));
    return { logged: results.length, sets: results };
  }

  // ═══════════════════════════════════════════════════════════════
  // EDIT / DELETE SET LOG
  // ═══════════════════════════════════════════════════════════════

  async updateSetLog(userId: string, workoutLogId: string, setLogId: string, dto: UpdateSetLogDto) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    const setLog = await this.prisma.workoutSetLog.findFirst({
      where: { id: setLogId, workoutSession: { workoutLogId } },
    });
    if (!setLog) throw new NotFoundException(`Set log "${setLogId}" not found in workout "${workoutLogId}"`);

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

  async deleteSetLog(userId: string, workoutLogId: string, setLogId: string) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    const setLog = await this.prisma.workoutSetLog.findFirst({
      where: { id: setLogId, workoutSession: { workoutLogId } },
    });
    if (!setLog) throw new NotFoundException(`Set log "${setLogId}" not found in workout "${workoutLogId}"`);

    await this.prisma.workoutSetLog.delete({ where: { id: setLogId } });
    return { success: true, message: 'Set deleted' };
  }

  // ═══════════════════════════════════════════════════════════════
  // EDIT WORKOUT NOTES
  // ═══════════════════════════════════════════════════════════════

  async updateWorkoutLog(userId: string, workoutLogId: string, dto: UpdateWorkoutLogDto) {
    await this.validateWorkoutLog(userId, workoutLogId);
    return this.prisma.workoutLog.update({
      where: { id: workoutLogId },
      data:  { ...(dto.notes !== undefined && { notes: dto.notes }) },
      include: { workoutSessions: { include: { trainingMethod: true, setLogs: true } } },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CANCEL WORKOUT
  // ═══════════════════════════════════════════════════════════════

  async cancelWorkout(userId: string, workoutLogId: string) {
    const log = await this.validateWorkoutLog(userId, workoutLogId);

    if (!['PENDING', 'IN_PROGRESS'].includes(log.status)) {
      throw new BadRequestException(
        `Cannot cancel a ${log.status} workout. Only PENDING and IN_PROGRESS can be cancelled.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.workoutSession.findMany({
        where:  { workoutLogId },
        select: { id: true },
      });
      if (sessions.length) {
        await tx.workoutSetLog.deleteMany({ where: { workoutSessionId: { in: sessions.map((s) => s.id) } } });
        await tx.workoutSession.deleteMany({ where: { workoutLogId } });
      }
      await tx.workoutLog.delete({ where: { id: workoutLogId } });
    });

    return { success: true, message: 'Workout cancelled and removed' };
  }

  // ═══════════════════════════════════════════════════════════════
  // REST TIMER
  // ═══════════════════════════════════════════════════════════════

  async startRestTimer(userId: string, workoutLogId: string, dto: StartRestTimerDto) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);
    const setLog = await this.prisma.workoutSetLog.findUnique({ where: { id: dto.setLogId } });
    if (!setLog) throw new NotFoundException(`Set log "${dto.setLogId}" not found`);
    return this.prisma.workoutSetLog.update({ where: { id: dto.setLogId }, data: { restStartedAt: new Date(), restEndedAt: null } });
  }

  async endRestTimer(userId: string, workoutLogId: string, setLogId: string) {
    await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);
    const setLog = await this.prisma.workoutSetLog.findUnique({ where: { id: setLogId } });
    if (!setLog)               throw new NotFoundException(`Set log "${setLogId}" not found`);
    if (!setLog.restStartedAt) throw new BadRequestException('Rest timer was not started');
    return this.prisma.workoutSetLog.update({ where: { id: setLogId }, data: { restEndedAt: new Date() } });
  }

  // ═══════════════════════════════════════════════════════════════
  // COMPLETE / SKIP WORKOUT
  // ═══════════════════════════════════════════════════════════════

  async completeWorkout(userId: string, workoutLogId: string, dto: CompleteWorkoutDto) {
    const log = await this.validateWorkoutLog(userId, workoutLogId, ['IN_PROGRESS']);

    const sessions = await this.prisma.workoutSession.findMany({ where: { workoutLogId }, include: { setLogs: true } });
    const totalVolume = sessions.reduce((t, s) => t + s.setLogs.reduce((sum, sl) => sum + (sl.weight ?? 0) * (sl.actualReps ?? 0), 0), 0);

    const completedAt     = new Date();
    const durationSeconds = log.startedAt ? Math.round((completedAt.getTime() - log.startedAt.getTime()) / 1000) : null;

    const active = await this.prisma.userActiveProgram.findUnique({
      where:  { userId },
      select: { programId: true, currentDay: true, currentWeek: true },
    });
    if (!active) throw new NotFoundException('No active program found');

    const program = await this.prisma.program.findUnique({
      where:  { id: active.programId },
      select: { durationWeeks: true, daysPerWeek: true },
    });
    if (!program) throw new NotFoundException('Program not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.workoutLog.update({
        where: { id: workoutLogId },
        data:  { status: 'COMPLETED', completedAt, durationSeconds, totalVolume, notes: dto.notes ?? null },
      });

      let newDay  = active.currentDay + 1;
      let newWeek = active.currentWeek;
      let programCompleted = false;

      if (newDay > program.daysPerWeek) { newDay = 1; newWeek = active.currentWeek + 1; }

      if (newWeek > program.durationWeeks) {
        programCompleted = true;
        await tx.userProgram.updateMany({ where: { userId, programId: active.programId, isCompleted: false }, data: { isCompleted: true, completedAt, completedWeeks: program.durationWeeks } });
        await tx.userActivityLog.create({ data: { userId, type: 'COMPLETED_PROGRAM', meta: { programId: active.programId } } });
        await tx.programAnalytics.updateMany({ where: { programId: active.programId }, data: { completedCount: { increment: 1 }, activeEnrollments: { decrement: 1 } } });
      } else {
        await tx.userActiveProgram.update({ where: { userId }, data: { currentDay: newDay, currentWeek: newWeek } });
      }

      await tx.user.update({ where: { id: userId }, data: { totalWorkouts: { increment: 1 }, lastActiveDate: completedAt } });
      await this.updateStreak(tx, userId, completedAt);
      await tx.userActivityLog.create({ data: { userId, type: 'COMPLETED_WORKOUT', meta: { workoutLogId, totalVolume, durationSeconds, programCompleted } } });
    });

    return this.prisma.workoutLog.findUnique({ where: { id: workoutLogId }, include: { workoutSessions: { include: { setLogs: true } } } });
  }

  async skipWorkout(userId: string, workoutLogId: string) {
    const log = await this.validateWorkoutLog(userId, workoutLogId);
    if (!['PENDING', 'IN_PROGRESS'].includes(log.status)) throw new BadRequestException(`Cannot skip a ${log.status} workout`);

    const active = await this.prisma.userActiveProgram.findUnique({ where: { userId }, select: { programId: true, currentDay: true, currentWeek: true } });
    if (!active) throw new NotFoundException('No active program');
    const program = await this.prisma.program.findUnique({ where: { id: active.programId }, select: { durationWeeks: true, daysPerWeek: true } });

    await this.prisma.$transaction(async (tx) => {
      await tx.workoutLog.update({ where: { id: workoutLogId }, data: { status: 'SKIPPED' } });
      let newDay = active.currentDay + 1;
      let newWeek = active.currentWeek;
      if (newDay > (program?.daysPerWeek ?? 3)) { newDay = 1; newWeek++; }
      if (newWeek <= (program?.durationWeeks ?? 10)) {
        await tx.userActiveProgram.update({ where: { userId }, data: { currentDay: newDay, currentWeek: newWeek } });
      }
    });

    return { success: true, message: 'Workout skipped. Program advanced to next day.' };
  }

  // ═══════════════════════════════════════════════════════════════
  // GET LOG / HISTORY
  // ═══════════════════════════════════════════════════════════════

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
        include: { workoutSessions: { include: { setLogs: { select: { weight: true, actualReps: true, isCompleted: true } } } } },
      }),
      this.prisma.workoutLog.count({ where: { userId, status: { in: ['COMPLETED', 'SKIPPED'] } } }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════

  // Shared response shape for both getTodaysWorkout and getWorkoutDay
  private buildDayResponse(p: {
    day: any; week: any;
    bfrEnabled: boolean; absWorkoutType: any;
    trainingMethodForDay: any;
    workoutLogId: string | null; workoutStatus: string | null;
    weekNumber: number; dayNumber: number;
    currentWeek: number; currentDay: number;
    totalWeeks: number; programName: string; programId: string;
  }) {
    const mainEx = p.day.exercises.filter((e: any) => !e.isBFR && !e.isAbs);
    const bfrEx  = p.day.exercises.filter((e: any) => e.isBFR);
    const absEx  = p.day.exercises.filter((e: any) => e.isAbs);

    return {
      // Position & navigation
      programId:     p.programId,
      programName:   p.programName,
      weekNumber:    p.weekNumber,
      dayNumber:     p.dayNumber,
      totalWeeks:    p.totalWeeks,
      isCurrentDay:  p.weekNumber === p.currentWeek && p.dayNumber === p.currentDay,
      isPast:        p.weekNumber < p.currentWeek || (p.weekNumber === p.currentWeek && p.dayNumber < p.currentDay),
      isFuture:      p.weekNumber > p.currentWeek || (p.weekNumber === p.currentWeek && p.dayNumber > p.currentDay),
      // Day info
      programDayId:  p.day.id,
      dayName:       p.day.name,
      dayType:       p.day.dayType,
      muscleGroups:  p.day.muscleGroups ?? [],
      trainingMethod: p.trainingMethodForDay?.trainingMethod ?? null,
      notes:         p.day.notes ?? null,
      // Week schedule
      trainingDays:  p.week.trainingDays ?? [],
      restDays:      p.week.restDays     ?? [],
      accessories:   p.week.accessories  ?? [],
      // User preferences
      bfrEnabled:    p.bfrEnabled,
      absWorkoutType: p.absWorkoutType,
      // Exercises
      mainExercises: mainEx,
      bfrExercises:  p.bfrEnabled ? bfrEx : [],
      absExercises:  absEx,
      // Log state
      workoutLogId:  p.workoutLogId,   // real ID (today) or null (future/past not started)
      workoutStatus: p.workoutStatus,  // PENDING | IN_PROGRESS | COMPLETED | SKIPPED | null
    };
  }

  private async validateWorkoutLog(userId: string, logId: string, allowedStatuses?: string[]) {
    const log = await this.prisma.workoutLog.findFirst({ where: { id: logId, userId } });
    if (!log) throw new NotFoundException(`Workout log "${logId}" not found`);
    if (allowedStatuses && !allowedStatuses.includes(log.status)) {
      throw new BadRequestException(`Workout is ${log.status}. Allowed: [${allowedStatuses.join(', ')}]`);
    }
    return log;
  }

  private async findSetLogId(sessionId: string, exerciseId: string, setNumber: number): Promise<string> {
    const existing = await this.prisma.workoutSetLog.findFirst({
      where:  { workoutSessionId: sessionId, exerciseId, setNumber },
      select: { id: true },
    });
    return existing?.id ?? 'not-found-create-new';
  }

  private async updateStreak(tx: any, userId: string, now: Date) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { streakDays: true, lastActiveDate: true } });
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

    const newStreak = diffDays === 0 ? user.streakDays
                    : diffDays === 1 ? user.streakDays + 1
                    : 1;

    await tx.user.update({ where: { id: userId }, data: { streakDays: newStreak } });
  }
}

