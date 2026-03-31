import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateHealthMarkerDto } from './dto/create.health.marker';
import { UpdateHealthMarkerDto } from './dto/update.health.marker';

@Injectable()
export class HealthMarkersService {
    constructor(readonly prisma: PrismaService) { }

    async createHealthMarkers(data: CreateHealthMarkerDto) {
        const check = await this.prisma.healthClinicChecker.create({
            data: {
                title: data.title,
                items: data.details
            }
        });
        return check
    };

    async deleteHealthMarkers(id: string) {
        const findHealthMarkers = await this.prisma.healthClinicChecker.findUnique({ where: { id: id } });

        if (!findHealthMarkers) throw new NotFoundException("Document not found");

        const result = await this.prisma.healthClinicChecker.delete({ where: { id: id } });

        return result;
    };

    async updateHealthMarkers(id: string, data: UpdateHealthMarkerDto) {
        const findHealthMarkers = await this.prisma.healthClinicChecker.findUnique({
            where: { id }
        });

        if (!findHealthMarkers) {
            throw new NotFoundException("Document not found");
        }

        const updated = await this.prisma.healthClinicChecker.update({
            where: { id },
            data: {
                ...(data.title && { title: data.title }),
                ...(data.details && { items: data.details }),
            },
        });

        return updated;
    };

    async findOne(id: string) {
        const marker = await this.prisma.healthClinicChecker.findUnique({
            where: { id },
        });

        if (!marker) {
            throw new NotFoundException('Health marker not found');
        }

        return marker;
    }

    async getHealthMarkers(page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;

        const data = await this.prisma.healthClinicChecker.findMany({
            skip,
            take: limit,
            orderBy: {
                createdAt: "desc",
            },
        });


        const total = await this.prisma.healthClinicChecker.count()

        return {
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            data,
        };
    }

}
