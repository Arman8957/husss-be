
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkoutDayType, WorkoutStatus, TrainingMethodType, SetType, MuscleGroup } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CompleteFreestyleSessionDto, FreestyleSetupDto, LogFreestyleSetDto, StartFreestyleSessionDto } from './dto/freestyle.dto';
import { IFreestyleDashboard, IFreestyleExercise, IFreestyleSessionInfo, ILastSession, IMethodCycleProgress, IRecentSession, ITrainingMethodOption } from './interfaces/freestyle.interface';
 
// All 13 training methods available in the UI (matches TrainingMethodType enum)
const ALL_TRAINING_METHODS: TrainingMethodType[] = [
  'FIVE_BY_FIVE',
  'MAX_OT',
  'BULLDOZER',
  'BURNS',
  'GIRONDA_8X8',
  'TEN_BY_THREE',
  'HIGH_REP_20_REP_SQUAT',
  'YATES_HIGH_INTENSITY',
  'WESTSIDE_CONJUGATE',
  'MODERATE_VOLUME',
  'SINGLES_DOUBLES_TRIPLES',
  'ACTIVATION',
  'CUSTOM',
];

//something 

 
// Maps TrainingMethodType → display name (matches UI screenshot)
const METHOD_DISPLAY_NAMES: Record<string, string> = {
  FIVE_BY_FIVE:          '5 × 5',
  MAX_OT:                'Max-OT',
  BULLDOZER:             'Bulldozer Training',
  BURNS:                 'Burns',
  GIRONDA_8X8:           'Gironda  8 × 8',
  TEN_BY_THREE:          '10 × 3',
  HIGH_REP_20_REP_SQUAT: 'High-Rep work',
  YATES_HIGH_INTENSITY:  'Yates / High-Intensity',
  WESTSIDE_CONJUGATE:    'Westside Conjugate',
  MODERATE_VOLUME:       'Moderate Volume',
  SINGLES_DOUBLES_TRIPLES: 'Singles / Doubles / Triples',
  ACTIVATION:            'Activation',
  CUSTOM:                '20-Rep Squats',
};
 
// Short labels for recent sessions shown in UI ("Pl", "Pu", "Le")
const DAY_TYPE_SHORT: Record<string, string> = {
  PUSH: 'Pu',
  PULL: 'Pl',
  LEGS: 'Le',
};
 
// Muscle groups per day type — used to query relevant exercises
const DAY_TYPE_MUSCLES: Record<string, MuscleGroup[]> = {
  PUSH: ['CHEST', 'SHOULDERS', 'TRICEPS'],
  PULL: ['BACK', 'BICEPS', 'TRAPS'],
  LEGS: ['QUADS', 'HAMSTRINGS', 'GLUTES', 'CALVES'],
};
 
// Default sets/reps per training method for exercise prescription
const METHOD_PRESCRIPTION: Record<string, { sets: number; reps: string; restSeconds: number }> = {
  FIVE_BY_FIVE:          { sets: 5,  reps: '5',     restSeconds: 180 },
  MAX_OT:                { sets: 2,  reps: '4-6',   restSeconds: 150 },
  BULLDOZER:             { sets: 1,  reps: '20',    restSeconds: 120 },
  BURNS:                 { sets: 1,  reps: '50',    restSeconds: 60  },
  GIRONDA_8X8:           { sets: 8,  reps: '8',     restSeconds: 30  },
  TEN_BY_THREE:          { sets: 10, reps: '3',     restSeconds: 45  },
  HIGH_REP_20_REP_SQUAT: { sets: 3,  reps: '15-20', restSeconds: 90  },
  YATES_HIGH_INTENSITY:  { sets: 2,  reps: '6-8',   restSeconds: 120 },
  WESTSIDE_CONJUGATE:    { sets: 4,  reps: '2-3',   restSeconds: 120 },
  MODERATE_VOLUME:       { sets: 3,  reps: '8-12',  restSeconds: 90  },
  SINGLES_DOUBLES_TRIPLES: { sets: 5, reps: '1-3',  restSeconds: 180 },
  ACTIVATION:            { sets: 2,  reps: '12-15', restSeconds: 45  },
  CUSTOM:                { sets: 1,  reps: '20',    restSeconds: 120 },
};
 
@Injectable()
export class FreestyleService {
  constructor(private readonly prisma: PrismaService) {}
 
  // ══════════════════════════════════════════════════════════════════════════
  // SETUP — Start Freestyle Mode
  // POST /freestyle/setup
  // ══════════════════════════════════════════════════════════════════════════
 
  async setup(userId: string, dto: FreestyleSetupDto) {
    // Check user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
 
    // Upsert freestyle config in AppConfig as JSON
    // Key: freestyle:{userId}
    const configKey = `freestyle:${userId}`;
    const configValue = JSON.stringify({
      programLengthWeeks: dto.programLengthWeeks,
      currentWeek:        1,
      sessionCount:       0,
      bfrEnabled:         dto.bfrEnabled ?? false,
      absWorkoutType:     dto.absWorkoutType ?? 'TWO_DAY',
      startedAt:          new Date().toISOString(),
      lastDayType:        null,
      // Per-dayType method usage tracking (for cycle rule)
      methodCycle: {
        PUSH: [],
        PULL: [],
        LEGS: [],
      },
    });
 
    await this.prisma.appConfig.upsert({
      where:  { key: configKey },
      create: { key: configKey, value: configValue, type: 'json', group: 'freestyle' },
      update: { value: configValue },
    });
 
    return {
      success: true,
      message: `Freestyle mode started! ${dto.programLengthWeeks}-week cycle configured.`,
      programLengthWeeks: dto.programLengthWeeks,
      bfrEnabled:         dto.bfrEnabled ?? false,
      absWorkoutType:     dto.absWorkoutType ?? 'TWO_DAY',
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD — Get full freestyle state for the UI
  // GET /freestyle/dashboard
  // Returns everything needed to render the Freestyle Workout screen
  // ══════════════════════════════════════════════════════════════════════════
 
  async getDashboard(userId: string): Promise<IFreestyleDashboard> {
    const config = await this.getFreestyleConfig(userId);
 
    // Get all training methods from DB
    const dbMethods = await this.prisma.trainingMethod.findMany({
      where:   { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
 
    // Build method lookup map
    const methodMap = new Map(dbMethods.map((m) => [m.type, m]));
 
    // Get last session
    const lastWorkoutLog = await this.prisma.workoutLog.findFirst({
      where: {
        userId,
        status:  'COMPLETED',
        // Only freestyle logs have no programId
        programId: null,
      },
      orderBy: { completedAt: 'desc' },
      include: {
        workoutSessions: {
          include: { trainingMethod: true },
          take: 1,
        },
      },
    });
 
    const lastSession: ILastSession | null = lastWorkoutLog
      ? {
          date:               lastWorkoutLog.completedAt ?? lastWorkoutLog.scheduledDate,
          dayType:            lastWorkoutLog.dayNumber?.toString() ?? 'PUSH', // stored in dayNumber field
          trainingMethodName: lastWorkoutLog.workoutSessions[0]?.trainingMethod?.name ?? 'Unknown',
        }
      : null;
 
    // Get recent freestyle sessions (last 10)
    const recentLogs = await this.prisma.workoutLog.findMany({
      where:   { userId, programId: null },
      orderBy: { scheduledDate: 'desc' },
      take:    10,
      include: {
        workoutSessions: {
          include: { trainingMethod: true, setLogs: true },
        },
      },
    });
 
    const recentSessions: IRecentSession[] = recentLogs.map((log) => {
      const dayTypeStr = log.notes?.split('|')[0]?.trim() ?? 'PUSH';
      const d          = new Date(log.scheduledDate);
      return {
        sessionId:          log.id,
        date:               log.scheduledDate,
        dayOfWeek:          d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumber:          d.getDate(),
        shortType:          DAY_TYPE_SHORT[dayTypeStr] ?? 'Pu',
        dayType:            dayTypeStr,
        trainingMethodName: log.workoutSessions[0]?.trainingMethod?.name ?? '',
        exerciseCount:      log.workoutSessions.reduce(
          (sum, s) => sum + new Set(s.setLogs.map((sl) => sl.exerciseId)).size,
          0,
        ),
        totalVolume: log.totalVolume,
        status:      log.status,
      };
    });
 
    // Build method cycle progress per day type
    const methodCycle = config?.methodCycle ?? { PUSH: [], PULL: [], LEGS: [] };
 
    const buildCycleProgress = (dayType: 'PUSH' | 'PULL' | 'LEGS'): IMethodCycleProgress => {
      const used      = (methodCycle[dayType] ?? []) as string[];
      const remaining = ALL_TRAINING_METHODS.filter((m) => !used.includes(m));
      return {
        dayType,
        totalMethods:     ALL_TRAINING_METHODS.length,
        usedMethods:      used,
        remainingMethods: remaining,
        cycleComplete:    remaining.length === 0,
        progress:         `${used.length}/${ALL_TRAINING_METHODS.length}`,
      };
    };
 
    // Build training method options for the UI list
    const usedForDisplay = methodCycle[config?.lastDayType ?? 'PUSH'] ?? [];
    const trainingMethods: ITrainingMethodOption[] = ALL_TRAINING_METHODS.map((type) => {
      const db = methodMap.get(type);
      return {
        id:                  db?.id ?? type,
        type,
        name:                db?.name ?? METHOD_DISPLAY_NAMES[type] ?? type,
        label:               db?.label ?? null,
        setsInfo:            db?.setsInfo ?? null,
        repRange:            db?.repRange ?? null,
        restPeriod:          db?.restPeriod ?? null,
        intensity:           db?.intensity ?? null,
        notes:               db?.notes ?? null,
        isUsedInCurrentCycle: usedForDisplay.includes(type),
      };
    });
 
    // Determine which day types are currently BLOCKED
    // Rule: no consecutive same type
    const lastDayType = config?.lastDayType ?? null;
    const allDayTypes: Array<'PUSH' | 'PULL' | 'LEGS'> = ['PUSH', 'PULL', 'LEGS'];
    const availableDayTypes = allDayTypes.filter((dt) => dt !== lastDayType);
 
    return {
      isActive: !!config,
      setup:    config
        ? {
            programLengthWeeks: config.programLengthWeeks,
            currentWeek:        config.currentWeek,
            bfrEnabled:         config.bfrEnabled,
            absWorkoutType:     config.absWorkoutType,
            startedAt:          new Date(config.startedAt),
          }
        : null,
      lastSession,
      methodCycleProgress: {
        PUSH: buildCycleProgress('PUSH'),
        PULL: buildCycleProgress('PULL'),
        LEGS: buildCycleProgress('LEGS'),
      },
      availableDayTypes,
      recentSessions,
      trainingMethods,
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // START SESSION
  // POST /freestyle/session/start
  // Validates rules, returns exercises for the chosen day type + method
  // ══════════════════════════════════════════════════════════════════════════
 
  async startSession(
    userId: string,
    dto: StartFreestyleSessionDto,
  ): Promise<IFreestyleSessionInfo> {
    const config = await this.getFreestyleConfig(userId);
    if (!config) {
      throw new BadRequestException(
        'Freestyle mode not configured. Call POST /freestyle/setup first.',
      );
    }
 
    // ── RULE 1: No consecutive same day type ─────────────────────────────
    if (config.lastDayType && config.lastDayType === dto.dayType) {
      throw new BadRequestException(
        `Cannot do ${dto.dayType} two sessions in a row. ` +
          `Last session was also ${dto.dayType}. Choose a different day type.`,
      );
    }
 
    // ── RULE 2: Method must be used in cycle order (warn if skipping) ────
    const methodCycle: Record<string, string[]> = config.methodCycle ?? {
      PUSH: [], PULL: [], LEGS: [],
    };
    const usedForDayType = methodCycle[dto.dayType] ?? [];
 
    // If all methods used → auto-reset cycle for this day type
    if (usedForDayType.length >= ALL_TRAINING_METHODS.length) {
      methodCycle[dto.dayType] = [];
      await this.updateFreestyleConfig(userId, { methodCycle });
    }
 
    // Get training method from DB
    const trainingMethod = await this.prisma.trainingMethod.findFirst({
      where: { type: dto.trainingMethod as any, isActive: true },
    });
    if (!trainingMethod) {
      throw new NotFoundException(
        `Training method "${dto.trainingMethod}" not found. Run seed first.`,
      );
    }
 
    // ── Get exercises for this day type ──────────────────────────────────
    const muscles   = DAY_TYPE_MUSCLES[dto.dayType] ?? ['CHEST'];
    const exercises = await this.prisma.exercise.findMany({
      where: {
        isActive:    true,
        isPublished: true,
        primaryMuscle: { in: muscles },
        // Exclude BFR and ABS exercises (those are separate tabs)
        category: { notIn: ['BFR', 'ABS'] },
      },
      include: {
        media: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    });
 
    if (exercises.length === 0) {
      throw new NotFoundException(
        `No exercises found for ${dto.dayType} (muscles: ${muscles.join(', ')}). ` +
          `Ensure the exercise library is seeded.`,
      );
    }
 
    // Get prescription for this method
    const prescription = METHOD_PRESCRIPTION[dto.trainingMethod] ?? {
      sets: 3, reps: '8-12', restSeconds: 90,
    };
 
    // ── Create WorkoutLog (status=IN_PROGRESS) ───────────────────────────
    const today    = new Date();
    today.setHours(0, 0, 0, 0);
 
    const workoutLog = await this.prisma.workoutLog.create({
      data: {
        userId,
        programId:     null, // freestyle has no program
        programDayId:  null,
        weekNumber:    config.currentWeek,
        dayNumber:     config.sessionCount + 1,
        status:        WorkoutStatus.IN_PROGRESS,
        scheduledDate: today,
        startedAt:     new Date(),
        // Store dayType + method in notes field for easy lookup
        notes: `${dto.dayType}|${dto.trainingMethod}|freestyle`,
      },
    });
 
    // Create WorkoutSession linked to training method
    const workoutSession = await this.prisma.workoutSession.create({
      data: {
        workoutLogId:    workoutLog.id,
        trainingMethodId: trainingMethod.id,
        sortOrder:       0,
        notes:           `Freestyle ${dto.dayType} — ${trainingMethod.name}`,
      },
    });
 
    const exerciseResponse: IFreestyleExercise[] = exercises.map((ex) => ({
      id:             ex.id,
      name:           ex.name,
      category:       ex.category,
      primaryMuscle:  ex.primaryMuscle,
      equipment:      ex.equipment,
      media:          ex.media,
      prescribedSets: prescription.sets,
      prescribedReps: prescription.reps,
      restSeconds:    prescription.restSeconds,
    }));
 
    return {
      sessionId:          workoutLog.id,
      dayType:            dto.dayType,
      trainingMethod:     dto.trainingMethod,
      trainingMethodName: trainingMethod.name,
      exercises:          exerciseResponse,
      methodDetails: {
        name:       trainingMethod.name,
        setsInfo:   trainingMethod.setsInfo,
        repRange:   trainingMethod.repRange,
        restPeriod: trainingMethod.restPeriod,
        intensity:  trainingMethod.intensity,
        notes:      trainingMethod.notes,
      },
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // LOG SET
  // POST /freestyle/session/:sessionId/log-set
  // ══════════════════════════════════════════════════════════════════════════
 
  async logSet(
    userId: string,
    sessionId: string,
    dto: LogFreestyleSetDto,
  ) {
    // Validate session belongs to user and is in progress
    const workoutLog = await this.prisma.workoutLog.findFirst({
      where:   { id: sessionId, userId, status: 'IN_PROGRESS' },
      include: { workoutSessions: { take: 1 } },
    });
    if (!workoutLog) {
      throw new NotFoundException(
        `Active freestyle session "${sessionId}" not found.`,
      );
    }
 
    // Validate exercise exists
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: dto.exerciseId, isActive: true },
    });
    if (!exercise) {
      throw new NotFoundException(`Exercise "${dto.exerciseId}" not found.`);
    }
 
    const workoutSessionId = workoutLog.workoutSessions[0]?.id;
    if (!workoutSessionId) {
      throw new NotFoundException('Workout session not found.');
    }
 
    const setLog = await this.prisma.workoutSetLog.create({
      data: {
        workoutSessionId,
        exerciseId:       dto.exerciseId,
        setNumber:        dto.setNumber,
        plannedReps:      dto.plannedReps ?? null,
        actualReps:       dto.actualReps  ?? null,
        weight:           dto.weight      ?? null,
        setType:          (dto.setType as SetType) ?? SetType.NORMAL,
        isCompleted:      dto.actualReps != null,
        notes:            dto.notes ?? null,
      },
      include: { exercise: { select: { name: true } } },
    });
 
    return {
      success:   true,
      setLogId:  setLog.id,
      setNumber: setLog.setNumber,
      exercise:  setLog.exercise.name,
      isCompleted: setLog.isCompleted,
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // COMPLETE SESSION
  // PATCH /freestyle/session/:sessionId/complete
  // ══════════════════════════════════════════════════════════════════════════
 
  async completeSession(
    userId: string,
    sessionId: string,
    dto: CompleteFreestyleSessionDto,
  ) {
    const workoutLog = await this.prisma.workoutLog.findFirst({
      where:   { id: sessionId, userId, status: 'IN_PROGRESS' },
      include: {
        workoutSessions: {
          include: {
            setLogs:       true,
            trainingMethod: true,
          },
        },
      },
    });
    if (!workoutLog) {
      throw new NotFoundException(`Active session "${sessionId}" not found.`);
    }
 
    // Calculate total volume (sum of weight × reps across all sets)
    const allSets    = workoutLog.workoutSessions.flatMap((s) => s.setLogs);
    const totalVolume = allSets.reduce(
      (sum, s) => sum + ((s.weight ?? 0) * (s.actualReps ?? 0)),
      0,
    );
 
    // Update workout log to COMPLETED
    const completedLog = await this.prisma.workoutLog.update({
      where: { id: sessionId },
      data: {
        status:          WorkoutStatus.COMPLETED,
        completedAt:     new Date(),
        durationSeconds: dto.durationSeconds ?? null,
        totalVolume:     totalVolume || null,
        notes:           workoutLog.notes + (dto.notes ? `|${dto.notes}` : ''),
      },
    });
 
    // Update user stats
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totalWorkouts:  { increment: 1 },
        lastActiveDate: new Date(),
        // Streak logic: increment if last active was yesterday
      },
    });
 
    // ── Update freestyle config: method cycle + lastDayType ───────────────
    const config = await this.getFreestyleConfig(userId);
    if (config) {
      // Parse dayType from notes
      const dayType = workoutLog.notes?.split('|')[0]?.trim() ?? 'PUSH';
      const methodType = workoutLog.notes?.split('|')[1]?.trim() ?? '';
 
      // Mark method as used in cycle for this dayType
      const methodCycle: Record<string, string[]> = config.methodCycle ?? {
        PUSH: [], PULL: [], LEGS: [],
      };
      const usedList = methodCycle[dayType] ?? [];
      if (!usedList.includes(methodType)) {
        usedList.push(methodType);
        methodCycle[dayType] = usedList;
      }
 
      // Increment session count + advance week if needed
      const newSessionCount = (config.sessionCount ?? 0) + 1;
      const daysPerWeek     = 5; // typical PPL = 5 training days per week
      const newWeek         = Math.min(
        Math.floor(newSessionCount / daysPerWeek) + 1,
        config.programLengthWeeks,
      );
 
      // Auto-reset after full cycle (programLengthWeeks × daysPerWeek)
      const totalSessions = config.programLengthWeeks * daysPerWeek;
      const shouldReset   = newSessionCount >= totalSessions;
 
      await this.updateFreestyleConfig(userId, {
        lastDayType:  dayType,
        methodCycle:  shouldReset ? { PUSH: [], PULL: [], LEGS: [] } : methodCycle,
        sessionCount: shouldReset ? 0 : newSessionCount,
        currentWeek:  shouldReset ? 1 : newWeek,
      });
    }
 
    // Log user activity
    await this.prisma.userActivityLog.create({
      data: {
        userId,
        type: 'COMPLETED_WORKOUT',
        meta: {
          sessionId,
          totalVolume,
          durationSeconds: dto.durationSeconds,
        } as any,
      },
    }).catch(() => {});
 
    return {
      success:         true,
      sessionId,
      status:          'COMPLETED',
      totalVolume,
      durationSeconds: dto.durationSeconds ?? null,
      setsLogged:      allSets.length,
      exercisesLogged: new Set(allSets.map((s) => s.exerciseId)).size,
      message:         'Freestyle session completed! Great work.',
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // SKIP SESSION
  // PATCH /freestyle/session/:sessionId/skip
  // ══════════════════════════════════════════════════════════════════════════
 
  async skipSession(userId: string, sessionId: string) {
    const workoutLog = await this.prisma.workoutLog.findFirst({
      where: { id: sessionId, userId, status: 'IN_PROGRESS' },
    });
    if (!workoutLog) {
      throw new NotFoundException(`Active session "${sessionId}" not found.`);
    }
 
    await this.prisma.workoutLog.update({
      where: { id: sessionId },
      data:  { status: WorkoutStatus.SKIPPED },
    });
 
    return { success: true, message: 'Session skipped.' };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // GET ACTIVE SESSION (resume in-progress session)
  // GET /freestyle/session/active
  // ══════════════════════════════════════════════════════════════════════════
 
  async getActiveSession(userId: string) {
    const workoutLog = await this.prisma.workoutLog.findFirst({
      where: { userId, status: 'IN_PROGRESS', programId: null },
      orderBy: { startedAt: 'desc' },
      include: {
        workoutSessions: {
          include: {
            trainingMethod: true,
            setLogs: {
              include: { exercise: { select: { name: true, primaryMuscle: true } } },
              orderBy: [{ exerciseId: 'asc' }, { setNumber: 'asc' }],
            },
          },
        },
      },
    });
 
    if (!workoutLog) return { activeSession: null };
 
    const dayType    = workoutLog.notes?.split('|')[0]?.trim() ?? 'PUSH';
    const methodType = workoutLog.notes?.split('|')[1]?.trim() ?? '';
 
    // Get exercises for this day type
    const muscles   = DAY_TYPE_MUSCLES[dayType] ?? ['CHEST'];
    const exercises = await this.prisma.exercise.findMany({
      where: {
        isActive:      true,
        isPublished:   true,
        primaryMuscle: { in: muscles },
        category:      { notIn: ['BFR', 'ABS'] },
      },
      include: { media: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
 
    const prescription = METHOD_PRESCRIPTION[methodType] ?? {
      sets: 3, reps: '8-12', restSeconds: 90,
    };
 
    return {
      activeSession: {
        sessionId:          workoutLog.id,
        dayType,
        trainingMethod:     methodType,
        trainingMethodName: workoutLog.workoutSessions[0]?.trainingMethod?.name ?? '',
        startedAt:          workoutLog.startedAt,
        loggedSets:         workoutLog.workoutSessions.flatMap((s) => s.setLogs),
        exercises:          exercises.map((ex) => ({
          id:             ex.id,
          name:           ex.name,
          category:       ex.category,
          primaryMuscle:  ex.primaryMuscle,
          equipment:      ex.equipment,
          media:          ex.media,
          prescribedSets: prescription.sets,
          prescribedReps: prescription.reps,
          restSeconds:    prescription.restSeconds,
        })),
      },
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // GET SESSION HISTORY
  // GET /freestyle/history?page=1&limit=20
  // ══════════════════════════════════════════════════════════════════════════
 
  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
 
    const [logs, total] = await Promise.all([
      this.prisma.workoutLog.findMany({
        where:   { userId, programId: null },
        orderBy: { scheduledDate: 'desc' },
        skip,
        take:    limit,
        include: {
          workoutSessions: {
            include: {
              trainingMethod: true,
              setLogs: {
                include: { exercise: { select: { name: true } } },
              },
            },
          },
        },
      }),
      this.prisma.workoutLog.count({ where: { userId, programId: null } }),
    ]);
 
    const data = logs.map((log) => {
      const dayType    = log.notes?.split('|')[0]?.trim() ?? 'PUSH';
      const allSets    = log.workoutSessions.flatMap((s) => s.setLogs);
      const d          = new Date(log.scheduledDate);
      return {
        sessionId:          log.id,
        date:               log.scheduledDate,
        dayOfWeek:          d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayType,
        shortType:          DAY_TYPE_SHORT[dayType] ?? 'Pu',
        trainingMethodName: log.workoutSessions[0]?.trainingMethod?.name ?? '',
        status:             log.status,
        durationSeconds:    log.durationSeconds,
        totalVolume:        log.totalVolume,
        exerciseCount:      new Set(allSets.map((s) => s.exerciseId)).size,
        setsCount:          allSets.length,
        startedAt:          log.startedAt,
        completedAt:        log.completedAt,
      };
    });
 
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // RESET FREESTYLE
  // DELETE /freestyle/reset
  // ══════════════════════════════════════════════════════════════════════════
 
  async reset(userId: string) {
    const configKey = `freestyle:${userId}`;
    await this.prisma.appConfig.deleteMany({ where: { key: configKey } });
 
    return {
      success: true,
      message: 'Freestyle mode reset. Call POST /freestyle/setup to start again.',
    };
  }
 
  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════
 
  private async getFreestyleConfig(userId: string): Promise<any | null> {
    const configKey = `freestyle:${userId}`;
    const record    = await this.prisma.appConfig.findUnique({
      where: { key: configKey },
    });
    if (!record) return null;
    try {
      return JSON.parse(record.value);
    } catch {
      return null;
    }
  }
 
  private async updateFreestyleConfig(
    userId: string,
    updates: Record<string, any>,
  ): Promise<void> {
    const configKey    = `freestyle:${userId}`;
    const existing     = await this.getFreestyleConfig(userId);
    const merged       = { ...(existing ?? {}), ...updates };
    const configValue  = JSON.stringify(merged);
 
    await this.prisma.appConfig.upsert({
      where:  { key: configKey },
      create: { key: configKey, value: configValue, type: 'json', group: 'freestyle' },
      update: { value: configValue },
    });
  }
}