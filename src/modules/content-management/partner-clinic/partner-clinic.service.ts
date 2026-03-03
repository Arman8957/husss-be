import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePartnerClinicDto } from './dto/create-partner-clinic.dto';
import { UpdatePartnerClinicDto } from './dto/update-partner-clinic.dto';

@Injectable()
export class PartnerClinicService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePartnerClinicDto) {
    return this.prisma.partnerClinic.create({
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.partnerClinic.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const clinic = await this.prisma.partnerClinic.findUnique({
      where: { id },
    });

    if (!clinic) {
      throw new NotFoundException('Partner clinic not found');
    }

    return clinic;
  }

  async update(id: string, dto: UpdatePartnerClinicDto) {
    await this.findOne(id);

    return this.prisma.partnerClinic.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.partnerClinic.delete({
      where: { id },
    });
  }
}