import { Injectable } from '@nestjs/common';
import { ProgramDifficulty, ProgramType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ProgrammeService {

    constructor(private readonly prisma: PrismaService) { }

    async getAllProgramme(page: number = 1, limit: number = 10, search?: string,
        filters?: {
            isActive?: boolean;
            isPublished?: boolean;
            isPremium?: boolean;
            type?: ProgramType;
            difficulty?: ProgramDifficulty;
        }) {
        const skip = (page - 1) * limit;

        const whereCondition: any = {
            ...filters
        };

        if (search) {
            whereCondition.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } }
            ];
        }

        const total = await this.prisma.program.count({ where: whereCondition });

        const programme = await this.prisma.program.findMany({
            where: whereCondition,
            skip,
            take: limit,
            orderBy: {
                sortOrder: "asc",
            }
        });

        return {
            meta: {
                page,
                limit,
                total,
                totalPage: Math.ceil(total / limit)
            },
            data: programme
        };
    }

}
