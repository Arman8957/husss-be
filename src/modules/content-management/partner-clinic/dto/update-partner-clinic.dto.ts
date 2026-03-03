import { PartialType } from '@nestjs/swagger';
import { CreatePartnerClinicDto } from './create-partner-clinic.dto';

export class UpdatePartnerClinicDto extends PartialType(
  CreatePartnerClinicDto,
) {}