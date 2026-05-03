import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TrainingMethodType } from '@prisma/client';
import { METHOD_LABEL_MAP, METHOD_TYPES } from './constant/training-method.constants';
import { CreateTrainingMethodDto, UpdateTrainingMethodDto } from './dto/training-method.dto';

 
@Injectable()
export class TrainingMethodsService {
  constructor(private readonly prisma: PrismaService) {}
 
  // ── GET ALL ───────────────────────────────────────────────────────────────
  // Returns all methods with a `label` field for the frontend.
  // Matches the METHOD_TYPES constant format.
 
  async findAll() {
    const methods = await this.prisma.trainingMethod.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
 
    return methods.map((m) => ({
      ...m,
      label: METHOD_LABEL_MAP[m.type as keyof typeof METHOD_LABEL_MAP] ?? m.name,
    }));
  }
 
  // ── GET ONE ───────────────────────────────────────────────────────────────
 
  async findOne(id: string) {
    const m = await this.prisma.trainingMethod.findUnique({ where: { id } });
    if (!m) throw new NotFoundException(`Training method "${id}" not found.`);
    return { ...m, label: METHOD_LABEL_MAP[m.type as keyof typeof METHOD_LABEL_MAP] ?? m.name };
  }
 
  // ── CREATE ────────────────────────────────────────────────────────────────
  // ONE method per type — blocked if the type already exists.
  // Admin must delete the existing one before re-creating.
 
  async create(dto: CreateTrainingMethodDto, adminUserId: string) {
    const existing = await this.prisma.trainingMethod.findFirst({
      where: { type: dto.type },
    });
    if (existing) {
      throw new ConflictException(
        `Training method "${dto.type}" already exists (id: ${existing.id}). ` +
        `Delete it first, then re-create — or update it via PATCH /admin/training-methods/${existing.id}.`,
      );
    }
 
    const method = await this.prisma.trainingMethod.create({
      data: {
        type:        dto.type,
        name:        dto.name,
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
 
    return {
      ...method,
      label: METHOD_LABEL_MAP[method.type as keyof typeof METHOD_LABEL_MAP] ?? method.name,
    };
  }
 
  // ── UPDATE (PARTIAL) ──────────────────────────────────────────────────────
 
  async update(id: string, dto: UpdateTrainingMethodDto, adminUserId: string) {
    const existing = await this.prisma.trainingMethod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Training method "${id}" not found.`);
 
    const data: Record<string, any> = {};
    if (dto.name        !== undefined) data.name        = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.setsInfo    !== undefined) data.setsInfo    = dto.setsInfo;
    if (dto.repRange    !== undefined) data.repRange    = dto.repRange;
    if (dto.restPeriod  !== undefined) data.restPeriod  = dto.restPeriod;
    if (dto.intensity   !== undefined) data.intensity   = dto.intensity;
    if (dto.notes       !== undefined) data.notes       = dto.notes;
    if (dto.isActive    !== undefined) data.isActive    = dto.isActive;
    if (dto.sortOrder   !== undefined) data.sortOrder   = dto.sortOrder;
 
    if (!Object.keys(data).length) {
      throw new BadRequestException('No fields to update.');
    }
 
    // Prevent name collision with another method
    if (dto.name) {
      const nameClash = await this.prisma.trainingMethod.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (nameClash) {
        throw new ConflictException(`Another training method already uses the name "${dto.name}".`);
      }
    }
 
    const updated = await this.prisma.trainingMethod.update({ where: { id }, data });
 
    return {
      ...updated,
      label: METHOD_LABEL_MAP[updated.type as keyof typeof METHOD_LABEL_MAP] ?? updated.name,
      updatedFields: Object.keys(data),
    };
  }
 
  // ── HARD DELETE ───────────────────────────────────────────────────────────
  // Complete removal from DB.
  // Blocked if the method is currently used in any ProgramWeek.
 
  async remove(id: string) {
    const existing = await this.prisma.trainingMethod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Training method "${id}" not found.`);
 
    // Block if assigned to any program week
    const usageCount = await this.prisma.programWeekTrainingMethod.count({
      where: { trainingMethodId: id },
    });
    if (usageCount > 0) {
      throw new ConflictException(
        `Cannot delete: this training method is used in ${usageCount} program week(s). ` +
        `Remove it from all programs first, then delete.`,
      );
    }
 
    await this.prisma.trainingMethod.delete({ where: { id } });
 
    return {
      success: true,
      message: `Training method "${existing.name}" (${existing.type}) permanently deleted. ` +
               `You can now re-create it via POST /admin/training-methods.`,
      deletedType: existing.type,
    };
  }
 
  // ── METHOD_TYPES CONSTANT (for frontend dropdowns) ─────────────────────
  getMethodTypes() {
    return METHOD_TYPES;
  }



  async findAllPublic(activeOnly: boolean = true) {
    const where = activeOnly ? { isActive: true } : {};

    const methods = await this.prisma.trainingMethod.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        type: true,
        label: true,
        description: true,
        setsInfo: true,
        repRange: true,
        restPeriod: true,
        intensity: true,
        notes: true,
        isActive: true,
        sortOrder: true,
      },
    });

    return methods.map((m) => ({
      ...m,
      label: m.label || METHOD_LABEL_MAP[m.type as keyof typeof METHOD_LABEL_MAP] || m.name,
    }));
  }

  /** Public API - Get single training method */
  async findOnePublic(id: string) {
    const method = await this.prisma.trainingMethod.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        label: true,
        description: true,
        setsInfo: true,
        repRange: true,
        restPeriod: true,
        intensity: true,
        notes: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!method) {
      throw new NotFoundException(`Training method with ID "${id}" not found`);
    }

    return {
      ...method,
      label: method.label || METHOD_LABEL_MAP[method.type as keyof typeof METHOD_LABEL_MAP] || method.name,
    };
  }
}