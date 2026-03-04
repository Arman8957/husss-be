
import { IsString, IsEnum, IsNumber, IsOptional, IsArray, IsUrl, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { SupplementCategory } from '@prisma/client';

export class CreateSupplementProductDto {

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(SupplementCategory)
  category: SupplementCategory;

  @IsNumber()
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsUrl()
  purchasePageUrl: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  benefits?: string[];
}