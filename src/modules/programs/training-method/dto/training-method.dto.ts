 
import {
  IsEnum, IsString, IsOptional, IsBoolean, IsInt,
  IsNotEmpty, MinLength, MaxLength, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { TrainingMethodType } from '@prisma/client';
 
export class CreateTrainingMethodDto {
  @ApiProperty({ enum: TrainingMethodType, example: 'FIVE_BY_FIVE' })
  @IsEnum(TrainingMethodType)
  type!: TrainingMethodType;
 
  @ApiProperty({ example: '5×5', description: 'Display name shown in UI' })
  @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(60)
  name!: string;
 
  @ApiProperty({ example: '5 sets of 5 heavy reps at 80-85% of 1RM.' })
  @IsString() @IsNotEmpty() @MaxLength(1000)
  description!: string;
 
  @ApiPropertyOptional({ example: '5 sets × 5 reps' })
  @IsOptional() @IsString() @MaxLength(100)
  setsInfo?: string;
 
  @ApiPropertyOptional({ example: '5' })
  @IsOptional() @IsString() @MaxLength(20)
  repRange?: string;
 
  @ApiPropertyOptional({ example: '2-3 min' })
  @IsOptional() @IsString() @MaxLength(50)
  restPeriod?: string;
 
  @ApiPropertyOptional({ example: 'High' })
  @IsOptional() @IsString() @MaxLength(30)
  intensity?: string;
 
  @ApiPropertyOptional({ example: 'Classic strength builder.' })
  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
 
  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
 
  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  sortOrder?: number;
}
 
export class UpdateTrainingMethodDto {
  @ApiPropertyOptional({ example: '5×5 Heavy' })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  name?: string;
 
  @ApiPropertyOptional({ example: 'Updated description.' })
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;
 
  @ApiPropertyOptional({ example: '5 sets × 5 reps' })
  @IsOptional() @IsString() @MaxLength(100)
  setsInfo?: string;
 
  @ApiPropertyOptional({ example: '5' })
  @IsOptional() @IsString() @MaxLength(20)
  repRange?: string;
 
  @ApiPropertyOptional({ example: '2-3 min' })
  @IsOptional() @IsString() @MaxLength(50)
  restPeriod?: string;
 
  @ApiPropertyOptional({ example: 'High' })
  @IsOptional() @IsString() @MaxLength(30)
  intensity?: string;
 
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
 
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;
 
  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  sortOrder?: number;
}
 