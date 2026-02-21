import {
  IsEmail, IsString, IsOptional, IsArray, MinLength, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CoachRegisterDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @IsOptional()
  @IsString()
  gymName?: string;

  @IsOptional()
  @IsString()
  gymLocation?: string;

   @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsArray()
  @IsString({ each: true })
  specialties: string[] = [];


}