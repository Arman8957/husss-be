import { ApiProperty } from "@nestjs/swagger";
import { BFRBodyType, BFRContentCategory, BFRSessionCategory, ResearchCategory } from "@prisma/client";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateBrfDto {
    @ApiProperty({ example: "Upper Body Hypertrophy BFR" })
    @IsNotEmpty()
    @IsString()
    title!: string;

    @ApiProperty({ enum: BFRBodyType, default: BFRBodyType.LOWER, example: "UPPER" })
    @IsNotEmpty()
    @IsString()
    bodyType!: string;

    @ApiProperty({ enum: BFRSessionCategory, default: BFRSessionCategory.HYPERTROPHY, example: "HYPERTROPHY" })
    @IsNotEmpty()
    @IsString()
    sessionCategory!: string;


    @ApiProperty({ example: 20 })
    @IsNotEmpty()
    @IsNumber()
    time!: number;

    @ApiProperty({ example: 2 })
    @IsNotEmpty()
    @IsNumber()
    exercise!: number;

    @ApiProperty({ example: "For chest, shoulders, arms using light loads." })
    @IsNotEmpty()
    @IsString()
    shortDescription!: string;

    @ApiProperty({ example: "HTML/Markdown rich text (safety info section)" })
    @IsNotEmpty()
    @IsString()
    richContent!: string;




}