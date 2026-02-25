import { Module } from '@nestjs/common';
import { PartnerClinicService } from './partner-clinic.service';
import { PartnerClinicController } from './partner-clinic.controller';

@Module({
  controllers: [PartnerClinicController],
  providers: [PartnerClinicService],
})
export class PartnerClinicModule {}
