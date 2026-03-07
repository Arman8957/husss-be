import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateBrfDto } from './dto/create.brf.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { BFRBodyType, BFRSessionCategory } from '@prisma/client';
import { UpdateBrfDto } from './dto/update.bfr.dto';

@Injectable()
export class BrfService {

    constructor(private readonly prisma: PrismaService) { }

    async createBRF(data: CreateBrfDto) {

        const result = await this.prisma.bFRContent.create({
            data: {
                title: data.title,
                category: "BFR_SESSION",
                bodyType: data.bodyType as BFRBodyType,
                shortDescription: data.shortDescription,
                sessionCategory: data.sessionCategory as BFRSessionCategory,
                richContent: data.richContent,
                durationMinutes: data.time,
                exerciseCount: data.exercise
            }
        });

        if (!result) throw new BadRequestException("BRF not published");

        return result

    };

    async allBfrList(sessionCategory: BFRSessionCategory) {

        const filter: any = { category: "BFR_SESSION" }

        if (sessionCategory) {
            filter.sessionCategory = sessionCategory
        }

        const result = await this.prisma.bFRContent.findMany({
            where: filter
        });
        return result;
    };

    async SingleBfrList(bfrId: string) {
        const result = await this.prisma.bFRContent.findUnique({
            where: {
                id: bfrId
            }
        });

        if (!result) throw new NotFoundException("Record not found");

        return result;

    };

    async deleteBfr(brfId: string) {
        const find = await this.prisma.bFRContent.findUnique({ where: { id: brfId } });
        if (!find) throw new NotFoundException("Bfr not found");
        await this.prisma.bFRContent.delete({ where: { id: brfId } });
    };

    async updateBfr(bfrid: string, data: UpdateBrfDto) {
        const find = await this.prisma.bFRContent.findUnique({ where: { id: bfrid } });
        if (!find) throw new NotFoundException("Bfr not found");
        const update = await this.prisma.bFRContent.update({
            where: {
                id: bfrid
            },
            data: {
                title: data.title,
                bodyType: data.bodyType as BFRBodyType,
                shortDescription: data.shortDescription,
                sessionCategory: data.sessionCategory as BFRSessionCategory,
                richContent: data.richContent,
                durationMinutes: data.time,
                exerciseCount: data.exercise
            }
        });
        if (!update) throw new NotFoundException("Bfr not updated");
        return update;
    };
}
