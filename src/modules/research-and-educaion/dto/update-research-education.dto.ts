import { PartialType } from '@nestjs/swagger';
import { CreateResearchEducationDto } from './create-research-education.dto';

export class UpdateResearchEducationDto extends PartialType(
  CreateResearchEducationDto,
) {}