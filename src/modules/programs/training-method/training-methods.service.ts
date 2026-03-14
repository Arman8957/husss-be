// src/modules/training-methods/training-methods.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service'; // ✅ THE shared PrismaService
import { Prisma } from '@prisma/client';
import { CreateTrainingMethodDto, UpdateTrainingMethodDto, TrainingMethodQueryDto } from './dto/training-method.dto';

@Injectable()
export class TrainingMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTrainingMethodDto, adminUserId: string) {
    const existing = await this.prisma.trainingMethod.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Training method "${dto.name}" already exists`);
    }

    const tm = await this.prisma.trainingMethod.create({
      data: {
        name:        dto.name,
        type:        dto.type,
        description: dto.description,
        setsInfo:    dto.setsInfo    ?? null,
        repRange:    dto.repRange    ?? null,
        restPeriod:  dto.restPeriod  ?? null,
        intensity:   dto.intensity   ?? null,
        notes:       dto.notes       ?? null,
        isActive:    dto.isActive    ?? true,
        sortOrder:   dto.sortOrder   ?? 0,
      },
    });

    await this.log(adminUserId, 'CREATE_TRAINING_METHOD', tm.id, { name: tm.name, type: tm.type });
    return tm;
  }

  async findAll(query: TrainingMethodQueryDto = {}) {
    const where: Prisma.TrainingMethodWhereInput = {};
    if (query.type     !== undefined) where.type     = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    // Default: no isActive filter → admin sees ALL (active + inactive)

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
    await this.findOne(id); // throws 404 if not found

    if (dto.name) {
      const conflict = await this.prisma.trainingMethod.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(`Training method "${dto.name}" already exists`);
      }
    }

    const updated = await this.prisma.trainingMethod.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined && { name:        dto.name }),
        ...(dto.type        !== undefined && { type:        dto.type }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.setsInfo    !== undefined && { setsInfo:    dto.setsInfo }),
        ...(dto.repRange    !== undefined && { repRange:    dto.repRange }),
        ...(dto.restPeriod  !== undefined && { restPeriod:  dto.restPeriod }),
        ...(dto.intensity   !== undefined && { intensity:   dto.intensity }),
        ...(dto.notes       !== undefined && { notes:       dto.notes }),
        ...(dto.isActive    !== undefined && { isActive:    dto.isActive }),
        ...(dto.sortOrder   !== undefined && { sortOrder:   dto.sortOrder }),
      },
    });

    await this.log(adminUserId, 'UPDATE_TRAINING_METHOD', id, dto);
    return updated;
  }

  async remove(id: string, adminUserId: string) {
    const tm = await this.findOne(id);

    // Smart delete: soft-delete if in use by any program, hard-delete if unused
    const inUse = await this.prisma.programWeekTrainingMethod.findFirst({
      where: { trainingMethodId: id },
    });

    if (inUse) {
      await this.prisma.trainingMethod.update({
        where: { id },
        data:  { isActive: false },
      });
      await this.log(adminUserId, 'SOFT_DELETE_TRAINING_METHOD', id, {
        reason: 'In use by program weeks — deactivated instead of deleted',
      });
      return {
        success: true,
        softDeleted: true,
        message: `"${tm.name}" is used by programs — deactivated (isActive=false). It still works in existing programs but won't appear for new ones.`,
      };
    }

    await this.prisma.trainingMethod.delete({ where: { id } });
    await this.log(adminUserId, 'DELETE_TRAINING_METHOD', id, { name: tm.name });
    return { success: true, softDeleted: false, message: `"${tm.name}" permanently deleted` };
  }

  private async log(adminUserId: string, action: string, targetId: string, details: object) {
    await this.prisma.adminActivityLog
      .create({ data: { adminUserId, action, targetType: 'TrainingMethod', targetId, details } })
      .catch(() => {});
  }
}


// // src/training-methods/training-methods.service.ts

// import {
//   Injectable, NotFoundException, ConflictException,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service'; // ✅ FIX: use shared PrismaService
// import {
//   CreateTrainingMethodDto, UpdateTrainingMethodDto, TrainingMethodQueryDto,
// } from './dto/training-method.dto';
// import { Prisma } from '@prisma/client';

// @Injectable()
// export class TrainingMethodsService {
//   constructor(private readonly prisma: PrismaService) {}

//   async create(dto: CreateTrainingMethodDto, adminUserId: string) {
//     const existing = await this.prisma.trainingMethod.findUnique({
//       where: { name: dto.name },
//     });
//     if (existing) {
//       throw new ConflictException(`Training method with name "${dto.name}" already exists`);
//     }

//     const tm = await this.prisma.trainingMethod.create({
//       data: {
//         name: dto.name,
//         type: dto.type,
//         description: dto.description,
//         setsInfo: dto.setsInfo ?? null,
//         repRange: dto.repRange ?? null,
//         restPeriod: dto.restPeriod ?? null,
//         intensity: dto.intensity ?? null,
//         notes: dto.notes ?? null,
//         isActive: dto.isActive ?? true,
//         sortOrder: dto.sortOrder ?? 0,
//       },
//     });

//     await this.logAction(adminUserId, 'CREATE_TRAINING_METHOD', 'TrainingMethod', tm.id, {
//       name: tm.name,
//       type: tm.type,
//     });

//     return tm;
//   }

//   async findAll(query: TrainingMethodQueryDto) {
//     const where: Prisma.TrainingMethodWhereInput = {};
//     if (query.type) where.type = query.type;
//     if (query.isActive !== undefined) where.isActive = query.isActive;

//     return this.prisma.trainingMethod.findMany({
//       where,
//       orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
//     });
//   }

//   async findOne(id: string) {
//     const tm = await this.prisma.trainingMethod.findUnique({ where: { id } });
//     if (!tm) throw new NotFoundException(`Training method "${id}" not found`);
//     return tm;
//   }

//   async update(id: string, dto: UpdateTrainingMethodDto, adminUserId: string) {
//     await this.findOne(id);

//     if (dto.name) {
//       const nameConflict = await this.prisma.trainingMethod.findFirst({
//         where: { name: dto.name, NOT: { id } },
//       });
//       if (nameConflict) {
//         throw new ConflictException(`Training method with name "${dto.name}" already exists`);
//       }
//     }

//     const updated = await this.prisma.trainingMethod.update({
//       where: { id },
//       data: {
//         ...(dto.name !== undefined && { name: dto.name }),
//         ...(dto.type !== undefined && { type: dto.type }),
//         ...(dto.description !== undefined && { description: dto.description }),
//         ...(dto.setsInfo !== undefined && { setsInfo: dto.setsInfo }),
//         ...(dto.repRange !== undefined && { repRange: dto.repRange }),
//         ...(dto.restPeriod !== undefined && { restPeriod: dto.restPeriod }),
//         ...(dto.intensity !== undefined && { intensity: dto.intensity }),
//         ...(dto.notes !== undefined && { notes: dto.notes }),
//         ...(dto.isActive !== undefined && { isActive: dto.isActive }),
//         ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
//       },
//     });

//     await this.logAction(adminUserId, 'UPDATE_TRAINING_METHOD', 'TrainingMethod', id, dto);
//     return updated;
//   }

//   async remove(id: string, adminUserId: string) {
//     const tm = await this.findOne(id);

//     // Check if used in any program week
//     const inUse = await this.prisma.programWeekTrainingMethod.findFirst({
//       where: { trainingMethodId: id },
//     });

//     if (inUse) {
//       await this.prisma.trainingMethod.update({ where: { id }, data: { isActive: false } });
//       await this.logAction(adminUserId, 'SOFT_DELETE_TRAINING_METHOD', 'TrainingMethod', id, {
//         reason: 'In use by program weeks',
//       });
//       return {
//         success: true,
//         message: 'Training method deactivated (soft-deleted) — it is in use by existing programs',
//       };
//     }

//     await this.prisma.trainingMethod.delete({ where: { id } });
//     await this.logAction(adminUserId, 'DELETE_TRAINING_METHOD', 'TrainingMethod', id, {
//       name: tm.name,
//     });
//     return { success: true, message: `Training method "${tm.name}" deleted` };
//   }

//   private async logAction(
//     adminUserId: string,
//     action: string,
//     targetType: string,
//     targetId: string,
//     details: object,
//   ) {
//     await this.prisma.adminActivityLog
//       .create({ data: { adminUserId, action, targetType, targetId, details } })
//       .catch(() => {});
//   }
// }