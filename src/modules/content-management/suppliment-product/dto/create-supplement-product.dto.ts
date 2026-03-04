
import { IsString, IsEnum, IsNumber, IsOptional, IsArray, IsUrl, IsNotEmpty, ArrayNotEmpty } from 'class-validator';
import { Transform, Type } from 'class-transformer';
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

    @Transform(({ value }) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return [value];
        return [];
    })
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    benefits?: string[];
}