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

//   affiliateProducts AffiliateProduct[]
//   userTracking      UserSupplementTracking[]

//   @@index([category])
//   @@map("supplements")
// }

export class Suppliment{
    name : string;
    category : string;
    productPrice : string;
    vendorname : string;

}