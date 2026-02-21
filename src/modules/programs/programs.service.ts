// src/programs/programs.service.ts

import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, ConflictException,
} from '@nestjs/common';

import {
  CreateProgramDto, UpdateProgramDto,
  AddExerciseToDayDto, UpdateExerciseInDayDto, ReorderExercisesDto,
  PublishProgramDto, ActivateProgramDto, ProgramQueryDto, CopyProgramDto,
} from './dto/programs.dto';
import {
  ProgramType, ExerciseTabType, MuscleGroup, ExerciseCategory,
  EquipmentType, MediaType, Prisma,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { SaveDaySplitDto } from './dto/programs.dto';
import { IProgramLibraryItem, IProgramReviewShape, IProgramWithWeeks } from './interface/program.interface';


@Injectable()
export class ProgramsService {
  constructor(private readonly prisma: PrismaService) {}

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
        ...(dto.durationWeeks !== undefined && { durationWeeks: dto.durationWeeks }),
        ...(dto.daySplitType !== undefined && { daySplitType: dto.daySplitType }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isPremium !== undefined && { isPremium: dto.isPremium }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.features !== undefined && { features: dto.features }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.thumbnailUrl !== undefined && { thumbnailUrl: dto.thumbnailUrl }),
      },
    });

    await this.logAction(adminUserId, 'UPDATE_PROGRAM', 'Program', programId, dto);
    return updated;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2 — Day Split
  // ═══════════════════════════════════════════════════════════

  async saveDaySplit(programId: string, dto: SaveDaySplitDto, adminUserId: string) {
    const program = await this.findProgramOrThrow(programId);

    if (program.isPublished) {
      throw new BadRequestException(
        'Cannot modify day split of a published program. Unpublish it first.',
      );
    }

    // Validate week numbers
    const invalid = dto.weeks
      .map((w) => w.weekNumber)
      .filter((n) => n < 1 || n > program.durationWeeks);
    if (invalid.length) {
      throw new BadRequestException(
        `Week numbers [${invalid.join(', ')}] are out of range for a ${program.durationWeeks}-week program`,
      );
    }

    // Check for duplicate week numbers in request
    const weekNums = dto.weeks.map((w) => w.weekNumber);
    if (new Set(weekNums).size !== weekNums.length) {
      throw new BadRequestException('Duplicate week numbers in request');
    }

    let hasBFR = false;
    let hasAbsWorkout = false;

    const result = await this.prisma.$transaction(async (tx) => {
      for (const weekDto of dto.weeks) {
        // Upsert week
        const week = await tx.programWeek.upsert({
          where: { programId_weekNumber: { programId, weekNumber: weekDto.weekNumber } },
          create: { programId, weekNumber: weekDto.weekNumber },
          update: {},
        });

        // Cascade-delete old days (exercises cascade via FK)
        const oldDays = await tx.programDay.findMany({
          where: { programWeekId: week.id },
          select: { id: true },
        });
        if (oldDays.length) {
          await tx.programDayExercise.deleteMany({
            where: { programDayId: { in: oldDays.map((d) => d.id) } },
          });
          await tx.programDay.deleteMany({ where: { programWeekId: week.id } });
        }

        // Remove old training method links
        await tx.programWeekTrainingMethod.deleteMany({ where: { programWeekId: week.id } });

        for (let i = 0; i < weekDto.days.length; i++) {
          const dayDto = weekDto.days[i];

          if (dayDto.hasBFR) hasBFR = true;
          if (dayDto.hasAbs) hasAbsWorkout = true;

          // Resolve training method
          const tm = await tx.trainingMethod.findFirst({
            where: { type: dayDto.trainingMethod, isActive: true },
          });
          if (!tm) {
            throw new BadRequestException(
              `Training method "${dayDto.trainingMethod}" not found. Please seed the training_methods table first.`,
            );
          }

          // Build notes from sub-fields
          const noteParts = [
            dayDto.description,
            dayDto.howToExecute ? `How to Execute: ${dayDto.howToExecute}` : null,
            dayDto.exerciseHint ? `Exercise Hint: ${dayDto.exerciseHint}` : null,
          ].filter(Boolean);

          // Create day
          await tx.programDay.create({
            data: {
              programWeekId: week.id,
              dayNumber: i + 1,
              dayType: dayDto.dayType,
              name: dayDto.name,
              notes: noteParts.length ? noteParts.join('\n') : null,
            },
          });

          // Link training method (upsert to handle re-saves)
          await tx.programWeekTrainingMethod.upsert({
            where: {
              programWeekId_dayType: {
                programWeekId: week.id,
                dayType: dayDto.dayType,
              },
            },
            create: {
              programWeekId: week.id,
              trainingMethodId: tm.id,
              dayType: dayDto.dayType,
            },
            update: { trainingMethodId: tm.id },
          });
        }
      }

      const daysPerWeek = dto.weeks[0]?.days.length ?? 0;

      return tx.program.update({
        where: { id: programId },
        data: { daysPerWeek, hasBFR, hasAbsWorkout },
      });
    });

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

      const { category, isBFR, isAbs } = this.resolveTabType(dto.tabType);

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
                ? { type: MediaType.IMAGE, url: dto.exerciseImageUrl, label: 'Exercise Image', sortOrder: 0 }
                : null,
              dto.exerciseAnimationUrl
                ? { type: MediaType.VIDEO, url: dto.exerciseAnimationUrl, label: 'Exercise Animation', sortOrder: 1 }
                : null,
            ].filter(Boolean) as any,
          },
        },
      });
      exerciseId = newExercise.id;
    } else {
      const ex = await this.prisma.exercise.findUnique({ where: { id: exerciseId } });
      if (!ex || !ex.isActive) {
        throw new NotFoundException(`Exercise "${exerciseId}" not found in library`);
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

    await this.logAction(adminUserId, 'ADD_EXERCISE_TO_DAY', 'ProgramDayExercise', pde.id, {
      programId,
      dayId,
      tabType: dto.tabType,
      exerciseName: pde.exercise.name,
    });

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
      throw new NotFoundException(`Exercise assignment ${pdeId} not found in day ${dayId}`);
    }

    const { isBFR, isAbs } = dto.tabType
      ? this.resolveTabType(dto.tabType)
      : { isBFR: pde.isBFR, isAbs: pde.isAbs };

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.sets?.length) {
        await tx.programDayExerciseSet.deleteMany({ where: { programDayExerciseId: pdeId } });
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
          ...(dto.accessoryNote !== undefined && { accessoryNote: dto.accessoryNote }),
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

    await this.logAction(adminUserId, 'UPDATE_EXERCISE_IN_DAY', 'ProgramDayExercise', pdeId, dto);
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
    if (!pde) throw new NotFoundException(`Exercise assignment ${pdeId} not found`);

    await this.prisma.programDayExercise.delete({ where: { id: pdeId } });
    await this.logAction(adminUserId, 'REMOVE_EXERCISE_FROM_DAY', 'ProgramDayExercise', pdeId, {
      programId, dayId,
    });

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
    await this.findDayOrThrow(programId, dayId);

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

    return { mainExercises, bfrExercises, absExercises };
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
                    exercise: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
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

    return {
      id: program.id,
      name: program.name,
      description: program.description,
      duration: `${program.durationWeeks} Weeks`,
      weeks: program.weeks.map((week) => ({
        weekNumber: week.weekNumber,
        days: week.days.map((day) => {
          const tm = week.trainingMethods.find((m) => m.dayType === day.dayType);
          const mainEx = day.exercises.filter((e) => !e.isBFR && !e.isAbs);
          const bfrEx = day.exercises.filter((e) => e.isBFR);
          const absEx = day.exercises.filter((e) => e.isAbs);

          return {
            dayNumber: day.dayNumber,
            name: day.name,
            dayType: day.dayType,
            method: tm?.trainingMethod?.name ?? null,
            notes: day.notes,
            mainExercises: mainEx.map((e) => ({
              id: e.id,
              exerciseName: e.exercise.name,
              sets: e.sets.length,
              reps: e.sets[0]?.reps ?? e.reps,
              rest: `${e.sets[0]?.restSeconds ?? e.restSeconds ?? 60} sec`,
              setDetails: e.sets,
              media: e.exercise.media,
            })),
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

  async publish(programId: string, dto: PublishProgramDto, adminUserId: string) {
    await this.findProgramOrThrow(programId);

    if (dto.publish) {
      const hasExercises = await this.prisma.programWeek.findFirst({
        where: {
          programId,
          days: { some: { exercises: { some: {} } } },
        },
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

    // Ensure analytics row exists
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
            days: {
              include: { exercises: { include: { sets: true } } },
            },
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
        },
      });

      for (const week of source.weeks) {
        const newWeek = await tx.programWeek.create({
          data: {
            programId: newProgram.id,
            weekNumber: week.weekNumber,
            isPremium: week.isPremium,
            notes: week.notes,
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
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.program.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          analytics: true,
          _count: { select: { weeks: true, reviews: true } },
        },
      }),
      this.prisma.program.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(programId: string): Promise<IProgramWithWeeks> {
    return this.fetchFullProgram(programId);
  }

  // ═══════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════

  async remove(programId: string, adminUserId: string) {
    const program = await this.findProgramOrThrow(programId);

    const activeCount = await this.prisma.userActiveProgram.count({ where: { programId } });
    if (activeCount > 0) {
      throw new ConflictException(
        `Cannot delete: ${activeCount} user(s) currently have this program active. Archive (isActive=false) instead.`,
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
      select: { isPremium: true, activeProgram: { select: { programId: true } } },
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
    if (!program) {
      throw new NotFoundException('Program not found or not available');
    }

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

    const active = await this.prisma.$transaction(async (tx) => {
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
        create: { programId: dto.programId, totalEnrollments: 1, activeEnrollments: 1 },
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

    return active;
  }

  async getUserActiveProgram(userId: string) {
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
    return active;
  }

  async deactivateProgram(userId: string) {
    const active = await this.prisma.userActiveProgram.findUnique({ where: { userId } });
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

  private async findProgramOrThrow(programId: string) {
    const p = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!p) throw new NotFoundException(`Program "${programId}" not found`);
    return p;
  }

  private async findDayOrThrow(programId: string, dayId: string) {
    const day = await this.prisma.programDay.findFirst({
      where: { id: dayId, programWeek: { programId } },
    });
    if (!day) {
      throw new NotFoundException(`Day "${dayId}" not found in program "${programId}"`);
    }
    return day;
  }

  private async nextSortOrder(tx: Prisma.TransactionClient, dayId: string): Promise<number> {
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
        return { category: ExerciseCategory.COMPOUND, isBFR: false, isAbs: false };
    }
  }

  private muscleFromString(exerciseFor?: string): MuscleGroup {
    if (!exerciseFor) return MuscleGroup.FULL_BODY;
    const map: Record<string, MuscleGroup> = {
      chest: 'CHEST', back: 'BACK', shoulder: 'SHOULDERS', bicep: 'BICEPS',
      tricep: 'TRICEPS', leg: 'LEGS', quad: 'QUADS', hamstring: 'HAMSTRINGS',
      calf: 'CALVES', calves: 'CALVES', glute: 'GLUTES', abs: 'ABS',
      trap: 'TRAPS', forearm: 'FOREARMS',
    };
    const lower = exerciseFor.toLowerCase();
    for (const [key, val] of Object.entries(map)) {
      if (lower.includes(key)) return val as MuscleGroup;
    }
    return MuscleGroup.FULL_BODY;
  }

  private async fetchFullProgram(programId: string): Promise<IProgramWithWeeks> {
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
                    exercise: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
                    sets: { orderBy: { setNumber: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!program) throw new NotFoundException(`Program "${programId}" not found`);
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
}