import { ApiProperty } from "@nestjs/swagger";
import { BFRBodyType, BFRContentCategory, BFRSessionCategory, ResearchCategory } from "@prisma/client";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateBrfDto {
    @ApiProperty({ example: "Upper Body Hypertrophy BFR" })
    @IsNotEmpty()
    @IsString()
<<<<<<< HEAD
    title: string;
=======
    title!: string;
>>>>>>> 91b4394369dc2571119f8dfa110a0522c00cc8a8

    @ApiProperty({ enum: BFRBodyType, default: BFRBodyType.LOWER, example: "UPPER" })
    @IsNotEmpty()
    @IsString()
<<<<<<< HEAD
    bodyType: string;
=======
    bodyType!: string;
>>>>>>> 91b4394369dc2571119f8dfa110a0522c00cc8a8

    @ApiProperty({ enum: BFRSessionCategory, default: BFRSessionCategory.HYPERTROPHY, example: "HYPERTROPHY" })
    @IsNotEmpty()
    @IsString()
<<<<<<< HEAD
    sessionCategory: string;
=======
    sessionCategory!: string;
>>>>>>> 91b4394369dc2571119f8dfa110a0522c00cc8a8


    @ApiProperty({ example: 20 })
    @IsNotEmpty()
    @IsNumber()
<<<<<<< HEAD
    time: number;
=======
    time!: number;
>>>>>>> 91b4394369dc2571119f8dfa110a0522c00cc8a8

    @ApiProperty({ example: 2 })
    @IsNotEmpty()
    @IsNumber()
<<<<<<< HEAD
    exercise: number;
=======
    exercise!: number;
>>>>>>> 91b4394369dc2571119f8dfa110a0522c00cc8a8

    @ApiProperty({ example: "For chest, shoulders, arms using light loads." })
    @IsNotEmpty()
    @IsString()
<<<<<<< HEAD
    shortDescription: string;
=======
    shortDescription!: string;
>>>>>>> 91b4394369dc2571119f8dfa110a0522c00cc8a8

    @ApiProperty({ example: "HTML/Markdown rich text (safety info section)" })
    @IsNotEmpty()
    @IsString()
<<<<<<< HEAD
    richContent: string;
=======
    richContent!: string;
>>>>>>> 91b4394369dc2571119f8dfa110a0522c00cc8a8




}