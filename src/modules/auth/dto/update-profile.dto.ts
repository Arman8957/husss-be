

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: '01712345678',
    description: 'Phone number — any format: 1712345678 / 01712345678 / +8801712345678',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;
}