import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateExecutionNoteDto } from './dto/create-execution-note.dto';
import { UpdateExecutionNoteDto } from './dto/update-execution-note.dto';

@Injectable()
export class ExecutionNoteService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateExecutionNoteDto) {
    const result = await this.prisma.executionNote.create({
      data: {
        title: data.title,
        notes: data.notes,
        finalMessage: data.finalMessage,
        position: data.position ?? 0,
        isActive: data.isActive ?? true,
      },
    });

    if (!result) {
      throw new BadRequestException('Execution note could not be created');
    }

    return result;
  }

  async findAll() {
    return this.prisma.executionNote.findMany({
      orderBy: {
        position: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const note = await this.prisma.executionNote.findUnique({
      where: { id },
    });

    if (!note) {
      throw new NotFoundException('Execution note not found');
    }

    return note;
  }

  async update(id: string, data: UpdateExecutionNoteDto) {
    const existing = await this.prisma.executionNote.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Execution note not found');
    }

    return this.prisma.executionNote.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.executionNote.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Execution note not found');
    }

    await this.prisma.executionNote.delete({
      where: { id },
    });

    return {
      message: 'Execution note deleted successfully',
    };
  }
}