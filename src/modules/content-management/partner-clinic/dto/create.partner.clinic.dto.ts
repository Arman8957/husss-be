import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";



export class PartnarClinicDto {
    @ApiProperty({ example: "Green Life Clinic" })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: "+8801712345678" })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({ example: "Bangladesh" })
    @IsString()
    @IsNotEmpty()
    country: string;

    @ApiProperty({ example: "Dhaka" })
    @IsString()
    @IsNotEmpty()
    city: string;

    @ApiProperty({ example: "House 12, Road 5, Dhanmondi" })
    @IsString()
    @IsNotEmpty()
    address: string;

    @ApiProperty({ example: "09:00 AM" })
    @IsString()
    @IsNotEmpty()
    openTime: string;

    @ApiProperty({ example: "08:00 PM" })
    @IsString()
    @IsNotEmpty()
    closeTime: string;
}