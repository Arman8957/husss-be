import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateHealthMarkerDto } from './dto/create.health.marker';

@Injectable()
export class HealthMarkersService {
    constructor(readonly prisma: PrismaService) { }

    async createHealthMarkers(data: CreateHealthMarkerDto) {
        
    }

}
