import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsString, ArrayNotEmpty } from "class-validator";
import { Transform } from "class-transformer";

export class CreateHealthMarkerDto {

    @ApiProperty({
        example: "Blood Pressure",
        description: "Title of the health marker",
    })
    @IsString()
    @Transform(({ value }) => value?.trim())
    title: string;

    @ApiProperty({
        example: ["High BP", "Low BP", "Normal BP"],
        description: "List of health details",
        type: [String],
    })
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    @Transform(({ value }) => {
        if (typeof value === "string") return [value];
        return value;
    })
    details: string[];
}