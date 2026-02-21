// src/training-methods/training-methods.service.ts

import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';

import {
  CreateTrainingMethodDto, UpdateTrainingMethodDto, TrainingMethodQueryDto,
} from './dto/training-method.dto';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TrainingMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTrainingMethodDto, adminUserId: string) {
    const existing = await this.prisma.trainingMethod.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Training method with name "${dto.name}" already exists`);
    }

    const tm = await this.prisma.trainingMethod.create({
      data: {
        name: dto.name,
        type: dto.type,
        description: dto.description,
        setsInfo: dto.setsInfo ?? null,
        repRange: dto.repRange ?? null,
        restPeriod: dto.restPeriod ?? null,
        intensity: dto.intensity ?? null,
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.logAction(adminUserId, 'CREATE_TRAINING_METHOD', 'TrainingMethod', tm.id, {
      name: tm.name,
      type: tm.type,
    });

    return tm;
  }

  async findAll(query: TrainingMethodQueryDto) {
    const where: Prisma.TrainingMethodWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    return this.prisma.trainingMethod.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const tm = await this.prisma.trainingMethod.findUnique({ where: { id } });
    if (!tm) throw new NotFoundException(`Training method "${id}" not found`);
    return tm;
  }

  async update(id: string, dto: UpdateTrainingMethodDto, adminUserId: string) {
    await this.findOne(id);

    if (dto.name) {
      const nameConflict = await this.prisma.trainingMethod.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (nameConflict) {
        throw new ConflictException(`Training method with name "${dto.name}" already exists`);
      }
    }

    const updated = await this.prisma.trainingMethod.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.setsInfo !== undefined && { setsInfo: dto.setsInfo }),
        ...(dto.repRange !== undefined && { repRange: dto.repRange }),
        ...(dto.restPeriod !== undefined && { restPeriod: dto.restPeriod }),
        ...(dto.intensity !== undefined && { intensity: dto.intensity }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });

    await this.logAction(adminUserId, 'UPDATE_TRAINING_METHOD', 'TrainingMethod', id, dto);
    return updated;
  }

  async remove(id: string, adminUserId: string) {
    const tm = await this.findOne(id);

    // Check if used in any program week
    const inUse = await this.prisma.programWeekTrainingMethod.findFirst({
      where: { trainingMethodId: id },
    });

    if (inUse) {
      await this.prisma.trainingMethod.update({ where: { id }, data: { isActive: false } });
      await this.logAction(adminUserId, 'SOFT_DELETE_TRAINING_METHOD', 'TrainingMethod', id, {
        reason: 'In use by program weeks',
      });
      return {
        success: true,
        message: 'Training method deactivated (soft-deleted) — it is in use by existing programs',
      };
    }

    await this.prisma.trainingMethod.delete({ where: { id } });
    await this.logAction(adminUserId, 'DELETE_TRAINING_METHOD', 'TrainingMethod', id, {
      name: tm.name,
    });
    return { success: true, message: `Training method "${tm.name}" deleted` };
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