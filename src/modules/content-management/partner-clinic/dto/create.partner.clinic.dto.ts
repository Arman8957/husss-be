// model PartnerClinic {
//   id            String   @id @default(cuid())
//   name          String
//   description   String?
//   address       String
//   city          String
//   country       String
//   phone         String?
//   email         String?
//   website       String?
//   bookingUrl    String?
//   imageUrl      String?
//   distanceMiles Float?
//   openingHours  String? // "8:00 AM 
//   closeTime     String? // 6:00 PM"
//   isActive      Boolean  @default(true)
//   sortOrder     Int      @default(0)
//   latitude      Float?
//   longitude     Float?
//   createdAt     DateTime @default(now())
//   updatedAt     DateTime @updatedAt

//   @@index([country, city])
//   @@map("partner_clinics")
// }


export class PartnarClinicDto {
    name: string;
    phone: string;
    country: string;
    city: string;
    address: string;
    openTime: string;
    closeTime: string;
}