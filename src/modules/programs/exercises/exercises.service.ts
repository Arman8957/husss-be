// src/exercises/exercises.service.ts

import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';

import { CreateExerciseDto, UpdateExerciseDto, ExerciseQueryDto } from './dto/exercise.dto';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ExercisesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExerciseDto, adminUserId: string) {
    const exercise = await this.prisma.exercise.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        instructions: dto.instructions ?? null,
        category: dto.category,
        primaryMuscle: dto.primaryMuscle,
        secondaryMuscles: dto.secondaryMuscles ?? [],
        equipment: dto.equipment ?? 'NONE',
        thumbnailUrl: dto.thumbnailUrl ?? null,
        videoUrl: dto.videoUrl ?? null,
        gifUrl: dto.gifUrl ?? null,
        isPublished: dto.isPublished ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdByAdminId: adminUserId,
        media: dto.media?.length
          ? {
              create: dto.media.map((m) => ({
                type: m.type,
                url: m.url,
                label: m.label ?? null,
                sortOrder: m.sortOrder ?? 0,
              })),
            }
          : undefined,
      },
      include: { media: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.logAction(adminUserId, 'CREATE_EXERCISE', 'Exercise', exercise.id, {
      name: exercise.name,
      category: exercise.category,
    });

    return exercise;
  }

  async findAll(query: ExerciseQueryDto) {
    const where: Prisma.ExerciseWhereInput = { isActive: true };

    if (query.category) where.category = query.category;
    if (query.primaryMuscle) where.primaryMuscle = query.primaryMuscle;
    if (query.equipment) where.equipment = query.equipment;
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const [data, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { media: { orderBy: { sortOrder: 'asc' } } },
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const exercise = await this.prisma.exercise.findFirst({
      where: { id, isActive: true },
      include: { media: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!exercise) throw new NotFoundException(`Exercise "${id}" not found`);
    return exercise;
  }

  async update(id: string, dto: UpdateExerciseDto, adminUserId: string) {
    const existing = await this.findOne(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.media !== undefined) {
        await tx.exerciseMedia.deleteMany({ where: { exerciseId: id } });
        if (dto.media.length) {
          await tx.exerciseMedia.createMany({
            data: dto.media.map((m) => ({
              exerciseId: id,
              type: m.type,
              url: m.url,
              label: m.label ?? null,
              sortOrder: m.sortOrder ?? 0,
            })),
          });
        }
      }

      return tx.exercise.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.instructions !== undefined && { instructions: dto.instructions }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.primaryMuscle !== undefined && { primaryMuscle: dto.primaryMuscle }),
          ...(dto.secondaryMuscles !== undefined && { secondaryMuscles: dto.secondaryMuscles }),
          ...(dto.equipment !== undefined && { equipment: dto.equipment }),
          ...(dto.thumbnailUrl !== undefined && { thumbnailUrl: dto.thumbnailUrl }),
          ...(dto.videoUrl !== undefined && { videoUrl: dto.videoUrl }),
          ...(dto.gifUrl !== undefined && { gifUrl: dto.gifUrl }),
          ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
        include: { media: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    await this.logAction(adminUserId, 'UPDATE_EXERCISE', 'Exercise', id, dto);
    return updated;
  }

  async remove(id: string, adminUserId: string) {
    const exercise = await this.findOne(id);

    // Check if used in any published program
    const usedInPublished = await this.prisma.programDayExercise.findFirst({
      where: {
        exerciseId: id,
        programDay: {
          programWeek: { program: { isPublished: true } },
        },
      },
    });

    if (usedInPublished) {
      // Soft delete
      await this.prisma.exercise.update({
        where: { id },
        data: { isActive: false, isPublished: false },
      });
      await this.logAction(adminUserId, 'SOFT_DELETE_EXERCISE', 'Exercise', id, {
        reason: 'Used in published program',
      });
      return {
        success: true,
        message: 'Exercise hidden (soft-deleted) — it is used in a published program',
      };
    }

    await this.prisma.exercise.delete({ where: { id } });
    await this.logAction(adminUserId, 'DELETE_EXERCISE', 'Exercise', id, { name: exercise.name });
    return { success: true, message: `Exercise "${exercise.name}" permanently deleted` };
  }

  async toggleFavorite(userId: string, exerciseId: string) {
    await this.findOne(exerciseId);

    const existing = await this.prisma.userFavoriteExercise.findUnique({
      where: { userId_exerciseId: { userId, exerciseId } },
    });

    if (existing) {
      await this.prisma.userFavoriteExercise.delete({
        where: { userId_exerciseId: { userId, exerciseId } },
      });
      return { isFavorited: false, message: 'Removed from favorites' };
    }

    await this.prisma.userFavoriteExercise.create({ data: { userId, exerciseId } });
    return { isFavorited: true, message: 'Added to favorites' };
  }

  async getUserFavorites(userId: string) {
    const favorites = await this.prisma.userFavoriteExercise.findMany({
      where: { userId },
      include: {
        exercise: {
          include: { media: { orderBy: { sortOrder: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return favorites.map((f) => f.exercise);
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