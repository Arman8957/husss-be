// src/programs/programs.service.ts
//
// CHANGES FROM PREVIOUS VERSION:
//  1. saveDaySplit() — saves muscleGroups per day (auto-inferred if not supplied)
//  2. create() / update() — pass trainingDays, restDays, dayFocus, accessories
//  3. copy() — copies all 4 program fields + muscleGroups on days
//  4. Helper inferMuscleGroups() — maps dayType+name → MuscleGroup[]

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  CreateProgramDto,
  UpdateProgramDto,
  AddExerciseToDayDto,
  UpdateExerciseInDayDto,
  ReorderExercisesDto,
  PublishProgramDto,
  ActivateProgramDto,
  ProgramQueryDto,
  CopyProgramDto,
  SaveDaySplitDto,
} from './dto/programs.dto';
import {
  ProgramType,
  ExerciseTabType,
  MuscleGroup,
  ExerciseCategory,
  EquipmentType,
  MediaType,
  WorkoutDayType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  IProgramLibraryItem,
  IProgramReviewShape,
  IProgramWithWeeks,
} from './interface/program.interface';
import { PatchDaySplitDto } from './dto/programPatch.dto';

@Injectable()
export class ProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════
  // USER — GET PROGRAM LIBRARY
  // GET /api/v1/programs/library
  //
  // Returns ONLY published + active programs.
  // Adds isLocked + isActiveForUser flags per program.
  // ═══════════════════════════════════════════════════════════════════════

  // async getLibrary(userId: string): Promise<IProgramLibraryItem[]> {
  //   const user = await this.prisma.user.findUnique({
  //     where:  { id: userId },
  //     select: { isPremium: true, activeProgram: { select: { programId: true } } },
  //   });
  //   if (!user) throw new NotFoundException('User not found');

  //   const programs = await this.prisma.program.findMany({
  //     where:   { isPublished: true, isActive: true },
  //     orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  //     include: {
  //       analytics: {
  //         select: {
  //           totalEnrollments:  true,
  //           completionRate:    true,
  //           activeEnrollments: true,
  //         },
  //       },
  //       weeks: {
  //         orderBy: { weekNumber: 'asc' },
  //         select: {
  //           id:           true,
  //           weekNumber:   true,
  //           isPremium:    true,
  //           trainingDays: true,
  //           restDays:     true,
  //         },
  //       },
  //       _count: { select: { reviews: true } },
  //     },
  //   });

  //   return programs.map((p) => ({
  //     ...p,
  //     isLocked:        p.isPremium && !user.isPremium,
  //     isActiveForUser: user.activeProgram?.programId === p.id,
  //     durationLabel:   `${p.durationWeeks} Weeks`,
  //     enrollments:     p.analytics?.totalEnrollments  ?? 0,
  //     completionRate:  Math.round(p.analytics?.completionRate ?? 0),
  //     reviewCount:     p._count.reviews,
  //   })) as IProgramLibraryItem[];
  // }

  // ═══════════════════════════════════════════════════════════
  // STEP 1 — Basic Info
  // ═══════════════════════════════════════════════════════════

  async create(dto: CreateProgramDto, adminUserId: string) {
    const program = await this.prisma.program.create({
      data: {
        name: dto.name,
        type: dto.type ?? ProgramType.BUILTIN,
        difficulty: dto.difficulty ?? 'INTERMEDIATE',
        durationWeeks: dto.durationWeeks,
        daysPerWeek: 0,
        daySplitType: dto.daySplitType ?? 'PUSH_PULL_LEGS',
        description: dto.description ?? null,
        isPremium: dto.isPremium ?? false,
        isActive: dto.isActive ?? true,
        isPublished: false,
        features: dto.features ?? [],
        tags: dto.tags ?? [],
        thumbnailUrl: dto.thumbnailUrl ?? null,
        createdByUserId: adminUserId,
        // trainingDays / restDays / dayFocus / accessories
        // are now per-week — set in SaveDaySplitDto → WeekConfigDto
      },
    });

    await this.logAction(adminUserId, 'CREATE_PROGRAM', 'Program', program.id, {
      name: program.name,
      type: program.type,
    });

    return program;
  }

  async update(programId: string, dto: UpdateProgramDto, adminUserId: string) {
    await this.findProgramOrThrow(programId);

    const updated = await this.prisma.program.update({
      where: { id: programId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.difficulty !== undefined && { difficulty: dto.difficulty }),
        ...(dto.durationWeeks !== undefined && {
          durationWeeks: dto.durationWeeks,
        }),
        ...(dto.daySplitType !== undefined && {
          daySplitType: dto.daySplitType,
        }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isPremium !== undefined && { isPremium: dto.isPremium }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.features !== undefined && { features: dto.features }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.thumbnailUrl !== undefined && {
          thumbnailUrl: dto.thumbnailUrl,
        }),
        // trainingDays / restDays / dayFocus / accessories are per-week,
        // update them by calling PATCH /programs/:id/day-split instead
      },
    });

    await this.logAction(
      adminUserId,
      'UPDATE_PROGRAM',
      'Program',
      programId,
      dto,
    );
    return updated;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2 — Day Split
  // ═══════════════════════════════════════════════════════════

  async saveDaySplit(
    programId: string,
    dto: SaveDaySplitDto,
    adminUserId: string,
  ) {
    // ── Pre-flight validation (all reads OUTSIDE transaction) ────────────────
    const program = await this.findProgramOrThrow(programId);

    if (program.isPublished) {
      throw new BadRequestException(
        'Cannot modify day split of a published program. Unpublish it first.',
      );
    }

    const invalid = dto.weeks
      .map((w) => w.weekNumber)
      .filter((n) => n < 1 || n > program.durationWeeks);
    if (invalid.length) {
      throw new BadRequestException(
        `Week numbers [${invalid.join(', ')}] are out of range for a ${program.durationWeeks}-week program`,
      );
    }

    const weekNums = dto.weeks.map((w) => w.weekNumber);
    if (new Set(weekNums).size !== weekNums.length) {
      throw new BadRequestException('Duplicate week numbers in request');
    }

    // ── READ 1: All training methods in ONE query ─────────────────────────────
    const requestedMethodTypes = [
      ...new Set(dto.weeks.flatMap((w) => w.days.map((d) => d.trainingMethod))),
    ];

    const foundMethods = await this.prisma.trainingMethod.findMany({
      where: { type: { in: requestedMethodTypes as any }, isActive: true },
      select: { id: true, type: true, name: true },
    });

    const methodMap = new Map(foundMethods.map((m) => [m.type, m]));

    // Validate all methods upfront — fail fast before any writes
    for (const type of requestedMethodTypes) {
      if (!methodMap.has(type)) {
        throw new BadRequestException(
          `Training method "${type}" not found or inactive. ` +
            `Run seed: npx ts-node prisma/seeds/training-methods.seed.ts`,
        );
      }
    }

    // ── READ 2: Existing weeks ────────────────────────────────────────────────
    const existingWeeks = await this.prisma.programWeek.findMany({
      where: { programId },
      select: { id: true, weekNumber: true },
    });
    const existingWeekMap = new Map(
      existingWeeks.map((w) => [w.weekNumber, w.id]),
    );

    // ── READ 3: Existing days for affected weeks ───────────────────────────────
    const affectedWeekIds = dto.weeks
      .map((w) => existingWeekMap.get(w.weekNumber))
      .filter(Boolean) as string[];

    const existingDays = affectedWeekIds.length
      ? await this.prisma.programDay.findMany({
          where: { programWeekId: { in: affectedWeekIds } },
          select: { id: true, programWeekId: true },
        })
      : [];

    const daysByWeekId = new Map<string, string[]>();
    for (const day of existingDays) {
      const arr = daysByWeekId.get(day.programWeekId) ?? [];
      arr.push(day.id);
      daysByWeekId.set(day.programWeekId, arr);
    }

    // ── Compute program-level flags before transaction ────────────────────────
    let hasBFR = false;
    let hasAbsWorkout = false;
    for (const weekDto of dto.weeks) {
      for (const dayDto of weekDto.days) {
        if (dayDto.hasBFR) hasBFR = true;
        if (dayDto.hasAbs) hasAbsWorkout = true;
      }
    }
    const daysPerWeek = dto.weeks[0]?.days.length ?? 0;

    // ── WRITE: Transaction — only fast writes, zero reads inside ──────────────
    await this.prisma.$transaction(
      async (tx) => {
        for (const weekDto of dto.weeks) {
          const existingWeekId = existingWeekMap.get(weekDto.weekNumber);

          // Upsert week — persist schedule metadata at week level
          let weekId: string;
          if (existingWeekId) {
            // Build update payload explicitly — avoids Prisma conditional spread type error
            const weekUpdateData: Prisma.ProgramWeekUpdateInput = {};
            if (weekDto.trainingDays !== undefined)
              weekUpdateData.trainingDays = weekDto.trainingDays;
            if (weekDto.restDays !== undefined)
              weekUpdateData.restDays = weekDto.restDays;
            if (weekDto.accessories !== undefined)
              weekUpdateData.accessories = weekDto.accessories;

            await tx.programWeek.update({
              where: { id: existingWeekId },
              data: weekUpdateData,
            });
            weekId = existingWeekId;
          } else {
            const newWeek = await tx.programWeek.create({
              data: {
                programId,
                weekNumber: weekDto.weekNumber,
                trainingDays: weekDto.trainingDays ?? [],
                restDays: weekDto.restDays ?? [],
                accessories: weekDto.accessories ?? [],
              },
              select: { id: true },
            });
            weekId = newWeek.id;
          }

          // Cascade delete existing days and their exercises
          const dayIds = daysByWeekId.get(weekId) ?? [];
          if (dayIds.length) {
            await tx.programDayExercise.deleteMany({
              where: { programDayId: { in: dayIds } },
            });
            await tx.programDay.deleteMany({
              where: { programWeekId: weekId },
            });
          }
          await tx.programWeekTrainingMethod.deleteMany({
            where: { programWeekId: weekId },
          });

          // Create new days
          for (let i = 0; i < weekDto.days.length; i++) {
            const dayDto = weekDto.days[i];
            const tm = methodMap.get(dayDto.trainingMethod)!;

            // ── Resolve muscleGroups ──────────────────────────────────────────
            // If admin explicitly checked boxes → use those.
            // Otherwise auto-infer from dayType + name (handles "Legs + Triceps", "Workout A" etc.)
            const muscleGroups: MuscleGroup[] =
              dayDto.muscleGroups && dayDto.muscleGroups.length > 0
                ? dayDto.muscleGroups
                : this.inferMuscleGroups(dayDto.dayType, dayDto.name);
            // ─────────────────────────────────────────────────────────────────

            // Build notes string from description + howToExecute + exerciseHint
            const noteParts = [
              dayDto.description ?? null,
              dayDto.howToExecute
                ? `How to Execute: ${dayDto.howToExecute}`
                : null,
              dayDto.exerciseHint
                ? `Exercise Hint: ${dayDto.exerciseHint}`
                : null,
            ].filter(Boolean);

            await tx.programDay.create({
              data: {
                programWeekId: weekId,
                dayNumber: i + 1,
                dayType: dayDto.dayType,
                name: dayDto.name, // "Push(Chest, Shoulders & Triceps)"
                muscleGroups, // auto-inferred or explicit checkboxes
                notes: noteParts.length ? noteParts.join('\n') : null,
              },
            });

            // Link training method to week+dayType
            await tx.programWeekTrainingMethod.create({
              data: {
                programWeekId: weekId,
                trainingMethodId: tm.id,
                dayType: dayDto.dayType,
              },
            });
          }
        }

        // Update program-level flags
        await tx.program.update({
          where: { id: programId },
          data: { daysPerWeek, hasBFR, hasAbsWorkout },
        });
      },
      { timeout: 30_000 },
    );

    await this.logAction(adminUserId, 'SAVE_DAY_SPLIT', 'Program', programId, {
      weeksConfigured: dto.weeks.length,
    });

    return this.fetchFullProgram(programId);
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3 — Exercises
  // ═══════════════════════════════════════════════════════════

  async addExerciseToDay(
    programId: string,
    dayId: string,
    dto: AddExerciseToDayDto,
    adminUserId: string,
  ) {
    await this.findDayOrThrow(programId, dayId);

    let exerciseId = dto.exerciseId ?? null;

    if (!exerciseId) {
      if (!dto.exerciseName) {
        throw new BadRequestException(
          'Either exerciseId (pick from library) or exerciseName (create inline) is required',
        );
      }

      const { category } = this.resolveTabType(dto.tabType);

      const newExercise = await this.prisma.exercise.create({
        data: {
          name: dto.exerciseName,
          description: dto.exerciseDescription ?? null,
          category,
          primaryMuscle: this.muscleFromString(dto.exerciseFor),
          equipment: EquipmentType.NONE,
          isActive: true,
          isPublished: true,
          createdByAdminId: adminUserId,
          media: {
            create: [
              dto.exerciseImageUrl
                ? {
                    type: MediaType.IMAGE,
                    url: dto.exerciseImageUrl,
                    label: 'Exercise Image',
                    sortOrder: 0,
                  }
                : null,
              dto.exerciseAnimationUrl
                ? {
                    // ✅ Use VIDEO for mp4/webm/mov, GIF for .gif files
                    type: /\.(mp4|webm|mov)$/i.test(dto.exerciseAnimationUrl)
                      ? MediaType.VIDEO
                      : MediaType.GIF,
                    url: dto.exerciseAnimationUrl,
                    label: /\.(mp4|webm|mov)$/i.test(dto.exerciseAnimationUrl)
                      ? 'Exercise Video'
                      : 'Exercise Animation',
                    sortOrder: 1,
                  }
                : null,
            ].filter(Boolean) as any,
          },
        },
      });
      exerciseId = newExercise.id;
    } else {
      const ex = await this.prisma.exercise.findUnique({
        where: { id: exerciseId },
        include: { media: { select: { id: true } } },
      });
      if (!ex || !ex.isActive) {
        throw new NotFoundException(
          `Exercise "${exerciseId}" not found in library`,
        );
      }
      // If admin passed media URLs and exercise has no media yet — attach them
      // Never overwrite existing media on a shared library exercise
      if (
        (dto.exerciseImageUrl || dto.exerciseAnimationUrl) &&
        ex.media.length === 0
      ) {
        const newMedia: Array<{
          type: MediaType;
          url: string;
          label: string;
          sortOrder: number;
          exerciseId: string;
        }> = [];
        if (dto.exerciseImageUrl) {
          newMedia.push({
            type: MediaType.IMAGE,
            url: dto.exerciseImageUrl,
            label: 'Exercise Image',
            sortOrder: 0,
            exerciseId: exerciseId!,
          });
        }
        if (dto.exerciseAnimationUrl) {
          const isVid = /\.(mp4|webm|mov)$/i.test(dto.exerciseAnimationUrl);
          newMedia.push({
            type: isVid ? MediaType.VIDEO : MediaType.GIF,
            url: dto.exerciseAnimationUrl,
            label: isVid ? 'Exercise Video' : 'Exercise Animation',
            sortOrder: 1,
            exerciseId: exerciseId!,
          });
        }
        await this.prisma.exerciseMedia.createMany({
          data: newMedia,
          skipDuplicates: true,
        });
      }
    }

    const { isBFR, isAbs } = this.resolveTabType(dto.tabType);

    const pde = await this.prisma.$transaction(async (tx) => {
      const nextOrder = dto.sortOrder ?? (await this.nextSortOrder(tx, dayId));

      return tx.programDayExercise.create({
        data: {
          programDayId: dayId,
          exerciseId,
          sortOrder: nextOrder,
          reps: dto.sets[0]?.reps ?? '10',
          restSeconds: dto.sets[0]?.restSeconds ?? 60,
          setType: dto.setType ?? 'NORMAL',
          isOptional: dto.isOptional ?? false,
          accessoryNote: dto.accessoryNote ?? null,
          isBFR,
          isAbs,
          sets: {
            create: dto.sets.map((s) => ({
              setNumber: s.setNumber,
              reps: s.reps,
              restSeconds: s.restSeconds,
              notes: s.notes ?? null,
            })),
          },
        },
        include: {
          exercise: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
          sets: { orderBy: { setNumber: 'asc' } },
        },
      });
    });

    await this.logAction(
      adminUserId,
      'ADD_EXERCISE_TO_DAY',
      'ProgramDayExercise',
      pde.id,
      {
        programId,
        dayId,
        tabType: dto.tabType,
        exerciseName: pde.exercise.name,
      },
    );

    return pde;
  }

  async updateExerciseInDay(
    programId: string,
    dayId: string,
    pdeId: string,
    dto: UpdateExerciseInDayDto,
    adminUserId: string,
  ) {
    await this.findDayOrThrow(programId, dayId);

    const pde = await this.prisma.programDayExercise.findFirst({
      where: { id: pdeId, programDayId: dayId },
    });
    if (!pde) {
      throw new NotFoundException(
        `Exercise assignment ${pdeId} not found in day ${dayId}`,
      );
    }

    const { isBFR, isAbs } = dto.tabType
      ? this.resolveTabType(dto.tabType)
      : { isBFR: pde.isBFR, isAbs: pde.isAbs };

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.sets?.length) {
        await tx.programDayExerciseSet.deleteMany({
          where: { programDayExerciseId: pdeId },
        });
        await tx.programDayExerciseSet.createMany({
          data: dto.sets.map((s) => ({
            programDayExerciseId: pdeId,
            setNumber: s.setNumber,
            reps: s.reps,
            restSeconds: s.restSeconds,
            notes: s.notes ?? null,
          })),
        });
      }

      return tx.programDayExercise.update({
        where: { id: pdeId },
        data: {
          ...(dto.exerciseId && { exerciseId: dto.exerciseId }),
          ...(dto.setType && { setType: dto.setType }),
          ...(dto.isOptional !== undefined && { isOptional: dto.isOptional }),
          ...(dto.accessoryNote !== undefined && {
            accessoryNote: dto.accessoryNote,
          }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.sets?.length && {
            reps: dto.sets[0].reps,
            restSeconds: dto.sets[0].restSeconds,
          }),
          isBFR,
          isAbs,
        },
        include: {
          exercise: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
          sets: { orderBy: { setNumber: 'asc' } },
        },
      });
    });

    await this.logAction(
      adminUserId,
      'UPDATE_EXERCISE_IN_DAY',
      'ProgramDayExercise',
      pdeId,
      dto,
    );
    return updated;
  }

  async removeExerciseFromDay(
    programId: string,
    dayId: string,
    pdeId: string,
    adminUserId: string,
  ) {
    await this.findDayOrThrow(programId, dayId);

    const pde = await this.prisma.programDayExercise.findFirst({
      where: { id: pdeId, programDayId: dayId },
    });
    if (!pde)
      throw new NotFoundException(`Exercise assignment ${pdeId} not found`);

    await this.prisma.programDayExercise.delete({ where: { id: pdeId } });
    await this.logAction(
      adminUserId,
      'REMOVE_EXERCISE_FROM_DAY',
      'ProgramDayExercise',
      pdeId,
      {
        programId,
        dayId,
      },
    );

    return { success: true, message: 'Exercise removed from day' };
  }

  async reorderExercises(
    programId: string,
    dayId: string,
    dto: ReorderExercisesDto,
    adminUserId: string,
  ) {
    await this.findDayOrThrow(programId, dayId);

    const existing = await this.prisma.programDayExercise.findMany({
      where: { programDayId: dayId },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((e) => e.id));
    const invalid = dto.orderedIds.filter((id) => !existingSet.has(id));
    if (invalid.length) {
      throw new BadRequestException(
        `These exercise IDs don't belong to day ${dayId}: [${invalid.join(', ')}]`,
      );
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, idx) =>
        this.prisma.programDayExercise.update({
          where: { id },
          data: { sortOrder: idx },
        }),
      ),
    );

    return { success: true, message: 'Exercises reordered' };
  }

  async getDayExercises(programId: string, dayId: string) {
    const day = await this.findDayOrThrow(programId, dayId);

    const [mainExercises, bfrExercises, absExercises] = await Promise.all([
      this.prisma.programDayExercise.findMany({
        where: { programDayId: dayId, isBFR: false, isAbs: false },
        orderBy: { sortOrder: 'asc' },
        include: {
          exercise: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
          sets: { orderBy: { setNumber: 'asc' } },
        },
      }),
      this.prisma.programDayExercise.findMany({
        where: { programDayId: dayId, isBFR: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          exercise: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
          sets: { orderBy: { setNumber: 'asc' } },
        },
      }),
      this.prisma.programDayExercise.findMany({
        where: { programDayId: dayId, isAbs: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          exercise: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
          sets: { orderBy: { setNumber: 'asc' } },
        },
      }),
    ]);

    return {
      dayId: day.id,
      dayName: day.name,
      dayType: day.dayType,
      muscleGroups: day.muscleGroups, // ← returned so UI can pre-check the checkboxes
      mainExercises,
      bfrExercises,
      absExercises,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 4 — Review & Publish
  // ═══════════════════════════════════════════════════════════

  async getReview(programId: string): Promise<IProgramReviewShape> {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
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
                    exercise: {
                      include: { media: { orderBy: { sortOrder: 'asc' } } },
                    },
                    sets: { orderBy: { setNumber: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!program) throw new NotFoundException(`Program ${programId} not found`);

    // ── Build week-level dayFocusItems from each week's days ─────────────────
    // trainingDays / restDays / accessories now live on ProgramWeek.
    // dayFocusItems are built from day.name + day.muscleGroups per week.

    return {
      id: program.id,
      name: program.name,
      description: program.description,
      duration: `${program.durationWeeks} Weeks`,
      // Top-level schedule metadata: pull from Week 1 as the canonical reference
      trainingDays: (program.weeks[0] as any)?.trainingDays ?? [],
      restDays: (program.weeks[0] as any)?.restDays ?? [],
      accessories: (program.weeks[0] as any)?.accessories ?? [],
      // dayFocusItems: built from Week 1 days (same structure every week)
      dayFocusItems: (
        program.weeks.find((w) => w.weekNumber === 1)?.days ?? []
      ).map((day) => ({
        label: day.name ?? day.dayType,
        muscleGroups: (day as any).muscleGroups?.length
          ? (day as any).muscleGroups
          : this.inferMuscleGroupsFromLabel(day.name ?? day.dayType),
      })),
      weeks: program.weeks.map((week) => ({
        weekNumber: week.weekNumber,
        // Per-week schedule metadata (may differ per week e.g. deload)
        trainingDays: (week as any).trainingDays ?? [],
        restDays: (week as any).restDays ?? [],
        accessories: (week as any).accessories ?? [],
        days: week.days.map((day) => {
          const tm = week.trainingMethods.find(
            (m) => m.dayType === day.dayType,
          );
          const mainEx = day.exercises.filter((e) => !e.isBFR && !e.isAbs);
          const bfrEx = day.exercises.filter((e) => e.isBFR);
          const absEx = day.exercises.filter((e) => e.isAbs);

          return {
            id: day.id, // ← ProgramDay ID (needed for addExercise, editDay)
            dayNumber: day.dayNumber,
            name: day.name,
            dayType: day.dayType,
            muscleGroups: (day as any).muscleGroups ?? [],
            method: tm?.trainingMethod?.name ?? null,
            notes: day.notes,
            mainExercises: mainEx.map((e) => ({
              id: e.id, // ProgramDayExercise ID
              exerciseId: e.exerciseId, // ← raw Exercise ID (for edit/delete)
              exerciseName: e.exercise.name,
              sets: e.sets.length,
              reps: e.sets[0]?.reps ?? e.reps,
              rest: `${e.sets[0]?.restSeconds ?? e.restSeconds ?? 60} sec`,
              setDetails: e.sets,
              media: e.exercise.media,
            })),
            // ✅ Full exercise arrays so the UI can render tabs properly
            bfrExercises: bfrEx.map((e) => ({
              id: e.id,
              exerciseId: e.exerciseId,
              exerciseName: e.exercise.name,
              sets: e.sets.length,
              reps: e.sets[0]?.reps ?? e.reps,
              rest: `${e.sets[0]?.restSeconds ?? e.restSeconds ?? 60} sec`,
              setDetails: e.sets,
              media: e.exercise.media,
              setType: e.setType,
              isOptional: e.isOptional,
              accessoryNote: e.accessoryNote,
            })),
            absExercises: absEx.map((e) => ({
              id: e.id,
              exerciseId: e.exerciseId,
              exerciseName: e.exercise.name,
              sets: e.sets.length,
              reps: e.sets[0]?.reps ?? e.reps,
              rest: `${e.sets[0]?.restSeconds ?? e.restSeconds ?? 60} sec`,
              setDetails: e.sets,
              media: e.exercise.media,
              setType: e.setType,
              isOptional: e.isOptional,
            })),
            // Convenience summary strings (kept for backward compat)
            bfrFinisher: bfrEx.length
              ? `Optional BFR finisher: ${bfrEx.map((e) => e.exercise.name).join(', ')}`
              : null,
            absNote: absEx.length
              ? `ABS: ${absEx.map((e) => e.exercise.name).join(', ')}`
              : null,
          };
        }),
      })),
    };
  }

  async publish(
    programId: string,
    dto: PublishProgramDto,
    adminUserId: string,
  ) {
    await this.findProgramOrThrow(programId);

    if (dto.publish) {
      const hasExercises = await this.prisma.programWeek.findFirst({
        where: { programId, days: { some: { exercises: { some: {} } } } },
      });
      if (!hasExercises) {
        throw new BadRequestException(
          'Cannot publish: program must have at least one week → day → exercise configured',
        );
      }
    }

    const updated = await this.prisma.program.update({
      where: { id: programId },
      data: { isPublished: dto.publish },
    });

    await this.prisma.programAnalytics.upsert({
      where: { programId },
      create: { programId },
      update: {},
    });

    await this.logAction(
      adminUserId,
      dto.publish ? 'PUBLISH_PROGRAM' : 'UNPUBLISH_PROGRAM',
      'Program',
      programId,
      { isPublished: dto.publish },
    );

    return updated;
  }

  // ═══════════════════════════════════════════════════════════
  // COPY
  // ═══════════════════════════════════════════════════════════

  async copy(programId: string, dto: CopyProgramDto, adminUserId: string) {
    const source = await this.prisma.program.findUnique({
      where: { id: programId },
      include: {
        weeks: {
          include: {
            trainingMethods: true,
            days: { include: { exercises: { include: { sets: true } } } },
          },
        },
      },
    });
    if (!source) throw new NotFoundException(`Program ${programId} not found`);

    const newName = dto.newName ?? `${source.name} (Copy)`;

    const copy = await this.prisma.$transaction(async (tx) => {
      const newProgram = await tx.program.create({
        data: {
          name: newName,
          type: source.type,
          difficulty: source.difficulty,
          durationWeeks: source.durationWeeks,
          daysPerWeek: source.daysPerWeek,
          daySplitType: source.daySplitType,
          description: source.description,
          isPremium: source.isPremium,
          isActive: true,
          isPublished: false,
          hasBFR: source.hasBFR,
          hasAbsWorkout: source.hasAbsWorkout,
          features: source.features,
          tags: source.tags,
          thumbnailUrl: source.thumbnailUrl,
          createdByUserId: adminUserId,
          // trainingDays/restDays/accessories now live on each ProgramWeek
        },
      });

      for (const week of source.weeks) {
        const newWeek = await tx.programWeek.create({
          data: {
            programId: newProgram.id,
            weekNumber: week.weekNumber,
            isPremium: week.isPremium,
            notes: week.notes,
            // Copy week-level schedule metadata
            trainingDays: (week as any).trainingDays ?? [],
            restDays: (week as any).restDays ?? [],
            accessories: (week as any).accessories ?? [],
          },
        });

        for (const tm of week.trainingMethods) {
          await tx.programWeekTrainingMethod.create({
            data: {
              programWeekId: newWeek.id,
              trainingMethodId: tm.trainingMethodId,
              dayType: tm.dayType,
            },
          });
        }

        for (const day of week.days) {
          const newDay = await tx.programDay.create({
            data: {
              programWeekId: newWeek.id,
              dayNumber: day.dayNumber,
              dayType: day.dayType,
              name: day.name,
              notes: day.notes,
              muscleGroups: day.muscleGroups, // ← copied per day
            },
          });

          for (const ex of day.exercises) {
            await tx.programDayExercise.create({
              data: {
                programDayId: newDay.id,
                exerciseId: ex.exerciseId,
                sortOrder: ex.sortOrder,
                reps: ex.reps,
                restSeconds: ex.restSeconds,
                setType: ex.setType,
                isOptional: ex.isOptional,
                accessoryNote: ex.accessoryNote,
                isBFR: ex.isBFR,
                isAbs: ex.isAbs,
                isAccessory: ex.isAccessory,
                notes: ex.notes,
                sets: {
                  create: ex.sets.map((s) => ({
                    setNumber: s.setNumber,
                    reps: s.reps,
                    restSeconds: s.restSeconds,
                    notes: s.notes,
                  })),
                },
              },
            });
          }
        }
      }

      return newProgram;
    });

    await this.logAction(adminUserId, 'COPY_PROGRAM', 'Program', copy.id, {
      sourceId: programId,
      sourceName: source.name,
    });

    return copy;
  }

  // ═══════════════════════════════════════════════════════════
  // LIST / GET — Admin
  // ═══════════════════════════════════════════════════════════

  async findAll(query: ProgramQueryDto) {
    const where: Prisma.ProgramWhereInput = {};

    if (query.type) where.type = query.type;
    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.isPremium !== undefined) where.isPremium = query.isPremium;
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.program.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          analytics: {
            select: {
              totalEnrollments: true,
              activeEnrollments: true,
              completionRate: true,
              completedCount: true,
            },
          },
          weeks: {
            orderBy: { weekNumber: 'asc' },
            select: {
              id: true,
              weekNumber: true,
              isPremium: true,
              trainingDays: true,
              restDays: true,
              _count: { select: { days: true } },
            },
          },
          _count: {
            select: {
              weeks: true,
              reviews: true,
            },
          },
        },
      }),
      this.prisma.program.count({ where }),
    ]);

    return {
      data: data.map((p) => ({
        ...p,
        durationLabel: `${p.durationWeeks} Weeks`,
        statusLabel: this.programStatusLabel(p),
        weekCount: p._count.weeks,
        reviewCount: p._count.reviews,
        enrollments: p.analytics?.totalEnrollments ?? 0,
        activeEnrollments: p.analytics?.activeEnrollments ?? 0,
        completionRate: Math.round(p.analytics?.completionRate ?? 0),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        // Aggregate counts for dashboard cards
        counts: {
          total,
          published: await this.prisma.program.count({
            where: { ...where, isPublished: true },
          }),
          active: await this.prisma.program.count({
            where: { ...where, isActive: true },
          }),
          premium: await this.prisma.program.count({
            where: { ...where, isPremium: true },
          }),
        },
      },
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────
  private programStatusLabel(p: {
    isPublished: boolean;
    isActive: boolean;
  }): string {
    if (!p.isActive) return 'ARCHIVED';
    if (!p.isPublished) return 'DRAFT';
    return 'PUBLISHED';
  }

  private getNextStep(program: any): string {
    if (!program.isPublished && program._count?.weeks === 0) {
      return 'Step 2: Configure day split → POST /admin/programs/:id/day-split';
    }
    if (program.isPublished) {
      return 'Program is published. Unpublish first to modify: PATCH /admin/programs/:id/publish { publish: false }';
    }
    return 'Step 3: Add exercises → POST /admin/programs/:id/days/:dayId/exercises, or publish → PATCH /admin/programs/:id/publish';
  }

  async findOne(programId: string): Promise<IProgramWithWeeks> {
    return this.fetchFullProgram(programId);
  }

  // ═══════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════

  async remove(programId: string, adminUserId: string) {
    const program = await this.findProgramOrThrow(programId);

    const activeCount = await this.prisma.userActiveProgram.count({
      where: { programId },
    });
    if (activeCount > 0) {
      throw new ConflictException(
        `Cannot delete: ${activeCount} user(s) currently have this program active. ` +
          `Archive (isActive=false) instead.`,
      );
    }

    await this.prisma.program.delete({ where: { id: programId } });
    await this.logAction(adminUserId, 'DELETE_PROGRAM', 'Program', programId, {
      name: program.name,
    });

    return { success: true, message: `Program "${program.name}" deleted` };
  }

  // ═══════════════════════════════════════════════════════════
  // USER — Library
  // ═══════════════════════════════════════════════════════════

  async getLibrary(userId: string): Promise<IProgramLibraryItem[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isPremium: true,
        activeProgram: { select: { programId: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const programs = await this.prisma.program.findMany({
      where: { isPublished: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        analytics: {
          select: {
            totalEnrollments: true,
            completionRate: true,
            activeEnrollments: true,
          },
        },
        _count: { select: { reviews: true } },
      },
    });

    return programs.map((p) => ({
      ...p,
      isLocked: p.isPremium && !user.isPremium,
      isActiveForUser: user.activeProgram?.programId === p.id,
    })) as IProgramLibraryItem[];
  }

  async activateProgram(userId: string, dto: ActivateProgramDto) {
    const program = await this.prisma.program.findFirst({
      where: { id: dto.programId, isPublished: true, isActive: true },
    });
    if (!program)
      throw new NotFoundException('Program not found or not available');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isPremium: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (program.isPremium && !user.isPremium) {
      throw new ForbiddenException(
        'This program requires a Premium subscription. Upgrade to access it.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.userActiveProgram.upsert({
        where: { userId },
        create: {
          userId,
          programId: dto.programId,
          currentWeek: 1,
          currentDay: 1,
          absWorkoutType: dto.absWorkoutType ?? 'TWO_DAY',
          bfrEnabled: dto.bfrEnabled ?? false,
          startedAt: new Date(),
        },
        update: {
          programId: dto.programId,
          currentWeek: 1,
          currentDay: 1,
          absWorkoutType: dto.absWorkoutType ?? 'TWO_DAY',
          bfrEnabled: dto.bfrEnabled ?? false,
          startedAt: new Date(),
        },
      });

      await tx.userProgram.create({
        data: {
          userId,
          programId: dto.programId,
          totalWeeks: program.durationWeeks,
        },
      });

      await tx.programAnalytics.upsert({
        where: { programId: dto.programId },
        create: {
          programId: dto.programId,
          totalEnrollments: 1,
          activeEnrollments: 1,
        },
        update: {
          totalEnrollments: { increment: 1 },
          activeEnrollments: { increment: 1 },
        },
      });

      await tx.userActivityLog.create({
        data: {
          userId,
          type: 'ENROLLED_IN_PROGRAM',
          meta: { programName: program.name, programId: program.id },
        },
      });

      return result;
    });
  }

  // async getUserActiveProgram(userId: string) {
  //   return this.prisma.userActiveProgram.findUnique({
  //     where: { userId },
  //     include: {
  //       program: {
  //         include: {
  //           weeks: {
  //             orderBy: { weekNumber: 'asc' },
  //             include: {
  //               trainingMethods: { include: { trainingMethod: true } },
  //               days: {
  //                 orderBy: { dayNumber: 'asc' },
  //                 include: {
  //                   exercises: {
  //                     orderBy: { sortOrder: 'asc' },
  //                     include: {
  //                       exercise: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
  //                       sets:     { orderBy: { setNumber: 'asc' } },
  //                     },
  //                   },
  //                 },
  //               },
  //             },
  //           },
  //         },
  //       },
  //     },
  //   });
  // }

  //   async getUserActivePrograms(userId: string) {
  //   return this.prisma.userActiveProgram.findMany({
  //     where: { userId },
  //     orderBy: { startedAt: 'desc' },   // Most recently activated first
  //     include: {
  //       program: {
  //         include: {
  //           weeks: {
  //             orderBy: { weekNumber: 'asc' },
  //             include: {
  //               trainingMethods: { include: { trainingMethod: true } },
  //               days: {
  //                 orderBy: { dayNumber: 'asc' },
  //                 include: {
  //                   exercises: {
  //                     orderBy: { sortOrder: 'asc' },
  //                     include: {
  //                       exercise: {
  //                         include: {
  //                           media: { orderBy: { sortOrder: 'asc' } }
  //                         }
  //                       },
  //                       sets: { orderBy: { setNumber: 'asc' } },
  //                     },
  //                   },
  //                 },
  //               },
  //             },
  //           },
  //         },
  //       },
  //     },
  //   });
  // }
  // async getUserActivePrograms(userId: string) {
  //   // Add logging temporarily to debug
  //   console.log(`Fetching active programs for user: ${userId}`);

  //   const activePrograms = await this.prisma.userActiveProgram.findMany({
  //     where: {
  //       userId,
  //     },
  //     orderBy: [
  //       { startedAt: 'desc' }, // Most recent first
  //       { id: 'desc' },
  //     ],
  //     include: {
  //       program: {
  //         include: {
  //           weeks: {
  //             orderBy: { weekNumber: 'asc' },
  //             include: {
  //               trainingMethods: {
  //                 include: { trainingMethod: true },
  //               },
  //               days: {
  //                 orderBy: { dayNumber: 'asc' },
  //                 include: {
  //                   exercises: {
  //                     orderBy: { sortOrder: 'asc' },
  //                     include: {
  //                       exercise: {
  //                         include: {
  //                           media: { orderBy: { sortOrder: 'asc' } },
  //                         },
  //                       },
  //                       sets: { orderBy: { setNumber: 'asc' } },
  //                     },
  //                   },
  //                 },
  //               },
  //             },
  //           },
  //         },
  //       },
  //     },
  //   });

  //   console.log(
  //     `Found ${activePrograms.length} active programs for user ${userId}`,
  //   );

  //   return activePrograms;
  // }

  async getUserActivePrograms(userId: string) {
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
                        exercise: {
                          include: { media: { orderBy: { sortOrder: 'asc' } } },
                        },
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

    // Also get progress from UserProgram history
    const history = await this.prisma.userProgram.findFirst({
      where: { userId, programId: active.programId, isCompleted: false },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        completedWeeks: true,
        totalWeeks: true,
        startedAt: true,
      },
    });

    return {
      ...active,
      completedWeeks: history?.completedWeeks ?? 0,
      totalWeeks: history?.totalWeeks ?? active.program.durationWeeks,
      progressPercent: history
        ? Math.round((history.completedWeeks / (history.totalWeeks || 1)) * 100)
        : 0,
      historyId: history?.id ?? null,
    };
  }

  async getUserProgramHistory(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isPremium: true,
        activeProgram: { select: { programId: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const history = await this.prisma.userProgram.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      include: {
        program: {
          select: {
            id: true,
            name: true,
            durationWeeks: true,
            daysPerWeek: true,
            difficulty: true,
            isPremium: true,
            thumbnailUrl: true,
            daySplitType: true,
            hasBFR: true,
            hasAbsWorkout: true,
            features: true,
          },
        },
      },
    });

    return history.map((h) => ({
      id: h.id, // UserProgram ID
      programId: h.programId,
      programName: h.program.name,
      thumbnailUrl: h.program.thumbnailUrl,
      difficulty: h.program.difficulty,
      durationWeeks: h.program.durationWeeks,
      daysPerWeek: h.program.daysPerWeek,
      isPremium: h.program.isPremium,
      hasBFR: h.program.hasBFR,
      hasAbsWorkout: h.program.hasAbsWorkout,
      features: h.program.features,
      startedAt: h.startedAt,
      completedAt: h.completedAt,
      isCompleted: h.isCompleted,
      completedWeeks: h.completedWeeks,
      totalWeeks: h.totalWeeks,
      progressPercent: Math.round(
        (h.completedWeeks / (h.totalWeeks || 1)) * 100,
      ),
      isCurrentlyActive: user.activeProgram?.programId === h.programId,
      // Status label
      statusLabel: h.isCompleted
        ? 'COMPLETED'
        : user.activeProgram?.programId === h.programId
          ? 'ACTIVE'
          : 'PAUSED',
    }));
  }

  // Detailed view of one program entry — shows full program + progress
  // ══════════════════════════════════════════════════════════════════════════

  async getUserProgramHistoryDetail(userId: string, historyId: string) {
    const history = await this.prisma.userProgram.findFirst({
      where: { id: historyId, userId },
    });
    if (!history)
      throw new NotFoundException('Program history record not found');

    const [program, activeRecord] = await Promise.all([
      this.fetchFullProgram(history.programId),
      this.prisma.userActiveProgram.findUnique({
        where: { userId },
        select: { programId: true, currentWeek: true, currentDay: true },
      }),
    ]);

    return {
      historyId: history.id,
      programId: history.programId,
      startedAt: history.startedAt,
      completedAt: history.completedAt,
      isCompleted: history.isCompleted,
      completedWeeks: history.completedWeeks,
      totalWeeks: history.totalWeeks,
      progressPercent: Math.round(
        (history.completedWeeks / (history.totalWeeks || 1)) * 100,
      ),
      isCurrentlyActive: activeRecord?.programId === history.programId,
      currentWeek:
        activeRecord?.programId === history.programId
          ? activeRecord.currentWeek
          : null,
      currentDay:
        activeRecord?.programId === history.programId
          ? activeRecord.currentDay
          : null,
      program,
    };
  }

  async deactivateProgram(userId: string) {
    const active = await this.prisma.userActiveProgram.findUnique({
      where: { userId },
    });
    if (!active) throw new NotFoundException('No active program found');

    await this.prisma.$transaction(async (tx) => {
      await tx.userActiveProgram.delete({ where: { userId } });
      await tx.programAnalytics.updateMany({
        where: { programId: active.programId, activeEnrollments: { gt: 0 } },
        data: { activeEnrollments: { decrement: 1 } },
      });
    });

    return { success: true, message: 'Program deactivated' };
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Auto-infer muscle group subcategories from dayType + day name.
   * Used when admin doesn't explicitly tick the checkboxes.
   *
   * Mapping matches real program data from the Excel sheets:
   *   "Push" / "Push A" / "Push B"  → Chest, Shoulders, Triceps
   *   "Pull" / "Pull A" / "Pull B"  → Back, Biceps, Traps
   *   "Legs"                         → Quads, Hamstrings, Calves, Glutes
   *   "Legs + Triceps"               → Quads, Hamstrings, Calves, Glutes, Triceps
   *   "Workout A/B" (2-2-2 program)  → all muscle groups (full body)
   *   UPPER                          → Chest, Back, Shoulders, Biceps, Triceps
   *   LOWER                          → Quads, Hamstrings, Calves, Glutes
   *   FULL_BODY                      → all muscle groups
   *   REST                           → [] (no muscles)
   */
  private inferMuscleGroups(
    dayType: WorkoutDayType,
    dayName?: string | null,
  ): MuscleGroup[] {
    // Check day name for special combos (takes priority over dayType enum)
    const nameLower = (dayName ?? '').toLowerCase();

    if (nameLower.includes('legs') && nameLower.includes('tricep')) {
      // "Legs + Triceps" — real split from Program 3
      return [
        MuscleGroup.QUADS,
        MuscleGroup.HAMSTRINGS,
        MuscleGroup.CALVES,
        MuscleGroup.GLUTES,
        MuscleGroup.TRICEPS,
      ];
    }

    if (nameLower.includes('workout')) {
      // "Workout A/B" from Program 4 (2-2-2) = full body per session
      return [
        MuscleGroup.BACK,
        MuscleGroup.CHEST,
        MuscleGroup.SHOULDERS,
        MuscleGroup.TRAPS,
        MuscleGroup.TRICEPS,
        MuscleGroup.BICEPS,
        MuscleGroup.QUADS,
        MuscleGroup.HAMSTRINGS,
        MuscleGroup.ABS,
      ];
    }

    // Fall back to dayType enum
    switch (dayType) {
      case WorkoutDayType.PUSH:
        return [MuscleGroup.CHEST, MuscleGroup.SHOULDERS, MuscleGroup.TRICEPS];

      case WorkoutDayType.PULL:
        return [MuscleGroup.BACK, MuscleGroup.BICEPS, MuscleGroup.TRAPS];

      case WorkoutDayType.LEGS:
        return [
          MuscleGroup.QUADS,
          MuscleGroup.HAMSTRINGS,
          MuscleGroup.CALVES,
          MuscleGroup.GLUTES,
        ];

      case WorkoutDayType.UPPER:
        return [
          MuscleGroup.CHEST,
          MuscleGroup.BACK,
          MuscleGroup.SHOULDERS,
          MuscleGroup.BICEPS,
          MuscleGroup.TRICEPS,
        ];

      case WorkoutDayType.LOWER:
        return [
          MuscleGroup.QUADS,
          MuscleGroup.HAMSTRINGS,
          MuscleGroup.CALVES,
          MuscleGroup.GLUTES,
        ];

      case WorkoutDayType.FULL_BODY:
        return [
          MuscleGroup.CHEST,
          MuscleGroup.BACK,
          MuscleGroup.SHOULDERS,
          MuscleGroup.BICEPS,
          MuscleGroup.TRICEPS,
          MuscleGroup.TRAPS,
          MuscleGroup.QUADS,
          MuscleGroup.HAMSTRINGS,
          MuscleGroup.CALVES,
          MuscleGroup.GLUTES,
          MuscleGroup.ABS,
        ];

      case WorkoutDayType.REST:
        return [];

      case WorkoutDayType.CUSTOM:
      default:
        // CUSTOM: no auto-inference — admin must supply muscleGroups explicitly
        return [];
    }
  }

  /**
   * Safely extracts string labels from dayFocus regardless of whether it arrived
   * as DayFocusItemDto[] (from CreateProgramDto) or string[] (raw/legacy).
   *
   * WHY THIS EXISTS:
   * UpdateProgramDto extends PartialType(CreateProgramDto). PartialType strips
   * runtime class metadata, so TypeScript widens dayFocus to
   * `(DayFocusItemDto | string)[] | undefined` in some inference paths.
   * Calling `.label` directly on that union causes:
   *   "Property 'label' does not exist on type 'string'"
   * This helper narrows the type safely at runtime.
   */
  private extractDayFocusLabels(
    dayFocus?: Array<{ label: string } | string>,
  ): string[] {
    if (!dayFocus?.length) return [];
    return dayFocus.map((f) => (typeof f === 'string' ? f : f.label));
  }

  /**
   * reconstructing dayFocusItems from the stored dayFocus string[]).
   * Delegates to the same logic as inferMuscleGroups but takes a label string.
   */
  private inferMuscleGroupsFromLabel(label: string): MuscleGroup[] {
    const l = label.toLowerCase();
    if (l.includes('legs') && l.includes('tricep')) {
      return [
        MuscleGroup.QUADS,
        MuscleGroup.HAMSTRINGS,
        MuscleGroup.CALVES,
        MuscleGroup.GLUTES,
        MuscleGroup.TRICEPS,
      ];
    }
    if (l.includes('push'))
      return [MuscleGroup.CHEST, MuscleGroup.SHOULDERS, MuscleGroup.TRICEPS];
    if (l.includes('pull'))
      return [MuscleGroup.BACK, MuscleGroup.BICEPS, MuscleGroup.TRAPS];
    if (l.includes('legs') || l.includes('leg'))
      return [
        MuscleGroup.QUADS,
        MuscleGroup.HAMSTRINGS,
        MuscleGroup.CALVES,
        MuscleGroup.GLUTES,
      ];
    if (l.includes('upper'))
      return [
        MuscleGroup.CHEST,
        MuscleGroup.BACK,
        MuscleGroup.SHOULDERS,
        MuscleGroup.BICEPS,
        MuscleGroup.TRICEPS,
      ];
    if (l.includes('lower'))
      return [
        MuscleGroup.QUADS,
        MuscleGroup.HAMSTRINGS,
        MuscleGroup.CALVES,
        MuscleGroup.GLUTES,
      ];
    if (l.includes('workout') || l.includes('full')) {
      return [
        MuscleGroup.BACK,
        MuscleGroup.CHEST,
        MuscleGroup.SHOULDERS,
        MuscleGroup.TRAPS,
        MuscleGroup.TRICEPS,
        MuscleGroup.BICEPS,
        MuscleGroup.QUADS,
        MuscleGroup.HAMSTRINGS,
        MuscleGroup.ABS,
      ];
    }
    return [];
  }

  private async findProgramOrThrow(programId: string) {
    const p = await this.prisma.program.findUnique({
      where: { id: programId },
    });
    if (!p) throw new NotFoundException(`Program "${programId}" not found`);
    return p;
  }

  private async findDayOrThrow(programId: string, dayId: string) {
    const day = await this.prisma.programDay.findFirst({
      where: { id: dayId, programWeek: { programId } },
    });
    if (!day) {
      throw new NotFoundException(
        `Day "${dayId}" not found in program "${programId}"`,
      );
    }
    return day;
  }

  private async nextSortOrder(
    tx: Prisma.TransactionClient,
    dayId: string,
  ): Promise<number> {
    const last = await tx.programDayExercise.findFirst({
      where: { programDayId: dayId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  private resolveTabType(tabType: ExerciseTabType): {
    category: ExerciseCategory;
    isBFR: boolean;
    isAbs: boolean;
  } {
    switch (tabType) {
      case ExerciseTabType.BFR_EXERCISE:
        return { category: ExerciseCategory.BFR, isBFR: true, isAbs: false };
      case ExerciseTabType.ABS_EXERCISE:
        return { category: ExerciseCategory.ABS, isBFR: false, isAbs: true };
      default:
        return {
          category: ExerciseCategory.COMPOUND,
          isBFR: false,
          isAbs: false,
        };
    }
  }

  private muscleFromString(exerciseFor?: string): MuscleGroup {
    if (!exerciseFor) return MuscleGroup.FULL_BODY;
    const map: Record<string, MuscleGroup> = {
      chest: 'CHEST',
      back: 'BACK',
      shoulder: 'SHOULDERS',
      bicep: 'BICEPS',
      tricep: 'TRICEPS',
      leg: 'LEGS',
      quad: 'QUADS',
      hamstring: 'HAMSTRINGS',
      calf: 'CALVES',
      calves: 'CALVES',
      glute: 'GLUTES',
      abs: 'ABS',
      trap: 'TRAPS',
      forearm: 'FOREARMS',
    };
    const lower = exerciseFor.toLowerCase();
    for (const [key, val] of Object.entries(map)) {
      if (lower.includes(key)) return val as MuscleGroup;
    }
    return MuscleGroup.FULL_BODY;
  }

  private async fetchFullProgram(
    programId: string,
  ): Promise<IProgramWithWeeks> {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      include: {
        analytics: true,
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
                    exercise: {
                      include: { media: { orderBy: { sortOrder: 'asc' } } },
                    },
                    sets: { orderBy: { setNumber: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!program)
      throw new NotFoundException(`Program "${programId}" not found`);
    return program as unknown as IProgramWithWeeks;
  }

  private async logAction(
    adminUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: object,
  ) {
    await this.prisma.adminActivityLog
      .create({ data: { adminUserId, action, targetType, targetId, details } })
      .catch(() => {});
  }


  //======================================================

  // ═══════════════════════════════════════════════════════════
// GET DAY SPLIT — returns week/day config without exercises
// GET /admin/programs/:id/day-split
// ═══════════════════════════════════════════════════════════
async getDaySplit(programId: string) {
  const program = await this.prisma.program.findUnique({
    where: { id: programId },
    select: {
      id: true,
      name: true,
      durationWeeks: true,
      daysPerWeek: true,
      daySplitType: true,
      hasBFR: true,
      hasAbsWorkout: true,
      isPublished: true,
      weeks: {
        orderBy: { weekNumber: 'asc' },
        select: {
          id: true,
          weekNumber: true,
          isPremium: true,
          trainingDays: true,
          restDays: true,
          accessories: true,
          trainingMethods: {
            select: {
              dayType: true,
              trainingMethod: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  label: true,
                  repRange: true,
                  restPeriod: true,
                  setsInfo: true,
                },
              },
            },
          },
          days: {
            orderBy: { dayNumber: 'asc' },
            select: {
              id: true,
              dayNumber: true,
              dayType: true,
              name: true,
              isRestDay: true,
              muscleGroups: true,
              notes: true,
              _count: {
                select: {
                  exercises: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!program) {
    throw new NotFoundException(`Program "${programId}" not found`);
  }

  return {
    programId: program.id,
    programName: program.name,
    durationWeeks: program.durationWeeks,
    daysPerWeek: program.daysPerWeek,
    daySplitType: program.daySplitType,
    hasBFR: program.hasBFR,
    hasAbsWorkout: program.hasAbsWorkout,
    isPublished: program.isPublished,
    weeksConfigured: program.weeks.length,
    isComplete: program.weeks.length === program.durationWeeks,
    weeks: program.weeks.map((week) => ({
      id: week.id,
      weekNumber: week.weekNumber,
      isPremium: week.isPremium,
      trainingDays: week.trainingDays,
      restDays: week.restDays,
      accessories: week.accessories,
      // Keyed by dayType so the frontend can look up method per day instantly
      trainingMethods: week.trainingMethods.reduce(
        (acc, tm) => {
          acc[tm.dayType] = tm.trainingMethod;
          return acc;
        },
        {} as Record<string, any>,
      ),
      days: week.days.map((day) => ({
        id: day.id,
        dayNumber: day.dayNumber,
        dayType: day.dayType,
        name: day.name,
        isRestDay: day.isRestDay,
        muscleGroups: day.muscleGroups,
        // Parsed from combined notes field
        description: day.notes?.split('\n')[0] ?? null,
        howToExecute:
          day.notes
            ?.split('\n')
            .find((l) => l.startsWith('How to Execute:'))
            ?.replace('How to Execute: ', '') ?? null,
        exerciseHint:
          day.notes
            ?.split('\n')
            .find((l) => l.startsWith('Exercise Hint:'))
            ?.replace('Exercise Hint: ', '') ?? null,
        exerciseCount: day._count.exercises,
      })),
    })),
  };
}

  // ═══════════════════════════════════════════════════════════
// PATCH DAY SPLIT — partial update (week metadata + days)
// PATCH /admin/programs/:id/day-split
// ═══════════════════════════════════════════════════════════
async patchDaySplit(
  programId: string,
  dto: PatchDaySplitDto,
  adminUserId: string,
) {
  // ── Pre-flight ────────────────────────────────────────────────────────────
  const program = await this.findProgramOrThrow(programId);

  if (program.isPublished) {
    throw new BadRequestException(
      'Cannot modify a published program. Unpublish it first.',
    );
  }

  // Validate week numbers are in range
  const outOfRange = dto.weeks
    .map((w) => w.weekNumber)
    .filter((n) => n < 1 || n > program.durationWeeks);

  if (outOfRange.length) {
    throw new BadRequestException(
      `Week numbers [${outOfRange.join(', ')}] exceed program duration (${program.durationWeeks} weeks)`,
    );
  }

  // ── READ: Existing weeks + days in one query ──────────────────────────────
  const existingWeeks = await this.prisma.programWeek.findMany({
    where: { programId },
    select: {
      id: true,
      weekNumber: true,
      days: {
        select: { id: true, dayNumber: true, dayType: true, notes: true },
        orderBy: { dayNumber: 'asc' },
      },
      trainingMethods: {
        select: { id: true, dayType: true, trainingMethodId: true },
      },
    },
  });

  const weekMap = new Map(existingWeeks.map((w) => [w.weekNumber, w]));

  // Validate all requested weeks actually exist (can't patch a week
  // that hasn't been created yet — use POST /day-split for that)
  const missingWeeks = dto.weeks
    .map((w) => w.weekNumber)
    .filter((n) => !weekMap.has(n));

  if (missingWeeks.length) {
    throw new BadRequestException(
      `Weeks [${missingWeeks.join(', ')}] have not been configured yet. ` +
        `Use POST /day-split to create them first.`,
    );
  }

  // ── Resolve training methods if any days are changing method ─────────────
  const requestedMethodTypes = [
    ...new Set(
      dto.weeks.flatMap(
        (w) =>
          w.days
            ?.filter((d) => d.trainingMethod)
            .map((d) => d.trainingMethod!) ?? [],
      ),
    ),
  ];

  const methodMap = new Map<string, { id: string; type: string }>();

  if (requestedMethodTypes.length) {
    const foundMethods = await this.prisma.trainingMethod.findMany({
      where: { type: { in: requestedMethodTypes as any }, isActive: true },
      select: { id: true, type: true },
    });
    for (const m of foundMethods) methodMap.set(m.type, m);

    const missing = requestedMethodTypes.filter((t) => !methodMap.has(t));
    if (missing.length) {
      throw new BadRequestException(
        `Training method(s) not found or inactive: ${missing.join(', ')}`,
      );
    }
  }

  // ── WRITE: Transaction ────────────────────────────────────────────────────
  await this.prisma.$transaction(
    async (tx) => {
      for (const weekDto of dto.weeks) {
        const existing = weekMap.get(weekDto.weekNumber)!;

        // ── 1. Update week-level fields (only what was sent) ───────────────
        const weekUpdate: Prisma.ProgramWeekUpdateInput = {};
        if (weekDto.trainingDays !== undefined)
          weekUpdate.trainingDays = weekDto.trainingDays;
        if (weekDto.restDays !== undefined)
          weekUpdate.restDays = weekDto.restDays;
        if (weekDto.accessories !== undefined)
          weekUpdate.accessories = weekDto.accessories;
        if (weekDto.isPremium !== undefined)
          weekUpdate.isPremium = weekDto.isPremium;

        if (Object.keys(weekUpdate).length) {
          await tx.programWeek.update({
            where: { id: existing.id },
            data: weekUpdate,
          });
        }

        // ── 2. Patch individual days ───────────────────────────────────────
        if (!weekDto.days?.length) continue;

        const dayMap = new Map(existing.days.map((d) => [d.dayNumber, d]));

        for (const dayDto of weekDto.days) {
          const existingDay = dayMap.get(dayDto.dayNumber);

          if (!existingDay) {
            throw new BadRequestException(
              `Day ${dayDto.dayNumber} does not exist in week ${weekDto.weekNumber}. ` +
                `Use POST /day-split to add new days.`,
            );
          }

          // ── Build day update ─────────────────────────────────────────────
          const dayUpdate: Prisma.ProgramDayUpdateInput = {};

          if (dayDto.dayType !== undefined) dayUpdate.dayType = dayDto.dayType;
          if (dayDto.name !== undefined) dayUpdate.name = dayDto.name;
          if (dayDto.muscleGroups !== undefined)
            dayUpdate.muscleGroups = dayDto.muscleGroups;

          // Rebuild notes only if at least one notes field was sent
          const notesChanged =
            dayDto.description !== undefined ||
            dayDto.howToExecute !== undefined ||
            dayDto.exerciseHint !== undefined;

          if (notesChanged) {
            // Parse existing notes so unchanged parts are preserved
            const existingLines = existingDay.notes?.split('\n') ?? [];
            const existingDescription =
              existingLines.find(
                (l) =>
                  !l.startsWith('How to Execute:') &&
                  !l.startsWith('Exercise Hint:'),
              ) ?? null;
            const existingHowTo =
              existingLines
                .find((l) => l.startsWith('How to Execute:'))
                ?.replace('How to Execute: ', '') ?? null;
            const existingHint =
              existingLines
                .find((l) => l.startsWith('Exercise Hint:'))
                ?.replace('Exercise Hint: ', '') ?? null;

            const description =
              dayDto.description !== undefined
                ? dayDto.description
                : existingDescription;
            const howToExecute =
              dayDto.howToExecute !== undefined
                ? dayDto.howToExecute
                : existingHowTo;
            const exerciseHint =
              dayDto.exerciseHint !== undefined
                ? dayDto.exerciseHint
                : existingHint;

            const noteParts = [
              description ?? null,
              howToExecute ? `How to Execute: ${howToExecute}` : null,
              exerciseHint ? `Exercise Hint: ${exerciseHint}` : null,
            ].filter(Boolean);

            dayUpdate.notes = noteParts.length ? noteParts.join('\n') : null;
          }

          // hasBFR / hasAbs update program-level flags — handled below
          if (Object.keys(dayUpdate).length) {
            await tx.programDay.update({
              where: { id: existingDay.id },
              data: dayUpdate,
            });
          }

          // ── Update training method link (if dayType or method changed) ───
          if (dayDto.trainingMethod) {
            const tm = methodMap.get(dayDto.trainingMethod)!;
            // The target dayType: either the new one (if changed) or existing
            const targetDayType = dayDto.dayType ?? existingDay.dayType;

            const existingLink = existing.trainingMethods.find(
              (m) => m.dayType === existingDay.dayType,
            );

            if (existingLink) {
              await tx.programWeekTrainingMethod.update({
                where: { id: existingLink.id },
                data: {
                  trainingMethodId: tm.id,
                  dayType: targetDayType,
                },
              });
            } else {
              // Link didn't exist — create it
              await tx.programWeekTrainingMethod.create({
                data: {
                  programWeekId: existing.id,
                  trainingMethodId: tm.id,
                  dayType: targetDayType,
                },
              });
            }
          }
        }

        // ── 3. Recompute program-level BFR / Abs flags from ALL days ──────
        // Only do this if hasBFR or hasAbs was touched in this request
        const anyBFROrAbsChanged = weekDto.days?.some(
          (d) => d.hasBFR !== undefined || d.hasAbs !== undefined,
        );

        if (anyBFROrAbsChanged) {
          // Apply in-memory changes then re-query to get accurate flags
          const updatedDays = existing.days.map((d) => {
            const patch = weekDto.days?.find(
              (pd) => pd.dayNumber === d.dayNumber,
            );
            return {
              hasBFR: patch?.hasBFR,
              hasAbs: patch?.hasAbs,
            };
          });

          // Fall back to DB count if flags aren't set in this patch
          const [bfrCount, absCount] = await Promise.all([
            tx.programDay.count({
              where: {
                programWeek: { programId },
                exercises: { some: { isBFR: true } },
              },
            }),
            tx.programDay.count({
              where: {
                programWeek: { programId },
                exercises: { some: { isAbs: true } },
              },
            }),
          ]);

          const hasBFR =
            updatedDays.some((d) => d.hasBFR === true) || bfrCount > 0;
          const hasAbsWorkout =
            updatedDays.some((d) => d.hasAbs === true) || absCount > 0;

          await tx.program.update({
            where: { id: programId },
            data: { hasBFR, hasAbsWorkout },
          });
        }
      }
    },
    { timeout: 15_000 },
  );

  await this.logAction(
    adminUserId,
    'PATCH_DAY_SPLIT',
    'Program',
    programId,
    {
      weeksPatched: dto.weeks.length,
      daysPatched: dto.weeks.reduce(
        (sum, w) => sum + (w.days?.length ?? 0),
        0,
      ),
    },
  );

  // Return the updated split view (same shape as GET /day-split)
  return this.getDaySplit(programId);
}


}
