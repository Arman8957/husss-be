import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateEssentialContentDto {
  @ApiProperty({ example: 'Healthy Lifestyle' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Basic health foundation guide' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '## This is markdown content' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ example: 'Thank you for reading' })
  @IsOptional()
  @IsString()
  finalMessage?: string;

  @ApiPropertyOptional({ example: 'Health Foundation' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}