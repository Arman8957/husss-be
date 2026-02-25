import { ApiProperty } from '@nestjs/swagger';
import { ResearchCategory } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateResearchEducationDto {
  @ApiProperty({ example: 'Upper Body Hypertrophy BFR' })
  @IsNotEmpty()
  @IsString()
  title!: string;

  @ApiProperty({
    enum: ResearchCategory,
    example: ResearchCategory.BASIC,
  })
  @IsEnum(ResearchCategory)
  researchCategory!: ResearchCategory;

  @ApiProperty({
    example: 'For chest, shoulders, arms using light loads.',
  })
  @IsNotEmpty()
  @IsString()
  shortDescription!: string;

  @ApiProperty({
    example: '<h2>Safety Info</h2><p>Detailed research...</p>',
  })
  @IsNotEmpty()
  @IsString()
  richContent!: string;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  sortOrder?: number;
}