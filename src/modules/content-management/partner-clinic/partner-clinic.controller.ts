import { Controller } from '@nestjs/common';
import { PartnerClinicService } from './partner-clinic.service';

@Controller('partner-clinic')
export class PartnerClinicController {
  constructor(private readonly partnerClinicService: PartnerClinicService) {}
}
