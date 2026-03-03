// model Supplement {
//   id            String             @id @default(cuid())
//   name          String
//   category      SupplementCategory
//   description   String?
//   dosage        String // "3-5g daily"
//   timing        String 
//   notes         String? 
//   isRecommended Boolean            @default(false)
//   sortOrder     Int                @default(0)
//   isActive      Boolean            @default(true)
//   createdAt     DateTime           @default(now())
//   updatedAt     DateTime           @updatedAt
//   vendorname    String?
//   productPrice  String?
//   productBenefit String?
//   productImage  String?

import { ApiProperty } from "@nestjs/swagger";
import { SupplementCategory } from "@prisma/client";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

//   affiliateProducts AffiliateProduct[]
//   userTracking      UserSupplementTracking[]

//   @@index([category])
//   @@map("supplements")
// }

export class Suppliment {
    @ApiProperty({ example: "Whey Protein Isolate" })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ enum: SupplementCategory, example: SupplementCategory.FOUNDATION })
    @IsString()
    @IsNotEmpty()
    category: string;

    @ApiProperty({ example: 2500 })
    @IsNumber()
    @IsNotEmpty()
    productPrice: number;

    @ApiProperty({ example: "HealthCare Nutrition Ltd." })
    @IsString()
    @IsNotEmpty()
    vendorname: string;

    @ApiProperty({ example: "Supports muscle growth and recovery after workout." })
    @IsString()
    @IsNotEmpty()
    productBenefit: string;

    @ApiProperty({ example: "https://example.com/images/whey-protein.jpg" })
    @IsString()
    @IsNotEmpty()
    productImage: string;

    @ApiProperty({ example: "https://example.com/products/whey-protein" })
    @IsString()
    @IsNotEmpty()
    productpurchesUrl: string;
}