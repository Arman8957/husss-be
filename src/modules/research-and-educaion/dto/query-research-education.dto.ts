import { ApiPropertyOptional } from '@nestjs/swagger';
import { ResearchCategory } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class QueryResearchEducationDto {
  @ApiPropertyOptional({ enum: ResearchCategory })
  @IsOptional()
  @IsEnum(ResearchCategory)
  researchCategory?: ResearchCategory;
}