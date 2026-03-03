import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateEssentialContentDto } from './dto/create-essential-content.dto';
import { UpdateEssentialContentDto } from './dto/update-essential-content.dto';

@Injectable()
export class EssentialContentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateEssentialContentDto) {
    return this.prisma.essentialContent.create({
      data,
    });
  }

  async findAll(search?: string) {
    return this.prisma.essentialContent.findMany({
      where: search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const data = await this.prisma.essentialContent.findUnique({
      where: { id },
    });

    if (!data) {
      throw new NotFoundException('Essential content not found');
    }

    return data;
  }

  async update(id: string, data: UpdateEssentialContentDto) {
    await this.findOne(id);

    return this.prisma.essentialContent.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.essentialContent.delete({
      where: { id },
    });
  }
}