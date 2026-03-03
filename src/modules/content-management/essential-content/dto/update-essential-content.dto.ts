import { PartialType } from '@nestjs/swagger';
import { CreateEssentialContentDto } from './create-essential-content.dto';

export class UpdateEssentialContentDto extends PartialType(
    CreateEssentialContentDto,
) { }