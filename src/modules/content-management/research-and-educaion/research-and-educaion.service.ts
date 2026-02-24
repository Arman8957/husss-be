import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  BFRContentCategory,
  Prisma,
} from '@prisma/client';
import { CreateResearchEducationDto } from './dto/create-research-education.dto';
import { UpdateResearchEducationDto } from './dto/update-research-education.dto';
import { QueryResearchEducationDto } from './dto/query-research-education.dto';

@Injectable()
export class ResearchEducationService {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ CREATE
  async create(data: CreateResearchEducationDto) {
    return this.prisma.bFRContent.create({
      data: {
        title: data.title,
        category: BFRContentCategory.RESEARCH_AND_EDUCATION,
        researchCategory: data.researchCategory,
        shortDescription: data.shortDescription,
        richContent: data.richContent,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  // ✅ FIND ALL (Only researchCategory filter)
  async findAll(query: QueryResearchEducationDto) {
    const where: Prisma.BFRContentWhereInput = {
      category: BFRContentCategory.RESEARCH_AND_EDUCATION,
      isActive: true,
      ...(query.researchCategory && {
        researchCategory: query.researchCategory,
      }),
    };

    return this.prisma.bFRContent.findMany({
      where,
      orderBy: {
        sortOrder: 'asc',
      },
    });
  }

  // ✅ FIND ONE
  async findOne(id: string) {
    const document = await this.prisma.bFRContent.findFirst({
      where: {
        id,
        category: BFRContentCategory.RESEARCH_AND_EDUCATION,
        isActive: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Research content not found');
    }

    return document;
  }

  // ✅ UPDATE
  async update(id: string, data: UpdateResearchEducationDto) {
    await this.findOne(id);

    return this.prisma.bFRContent.update({
      where: { id },
      data,
    });
  }

  // ✅ DELETE
  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.bFRContent.delete({
      where: { id }
    });
  }
}