import { Injectable } from '@nestjs/common';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SupplimentProductService {

    constructor(private readonly cloudinaryService: CloudinaryService, private readonly prisma: PrismaService) { }

    async AddSupplimentProduct(imageUrl : Express.Multer.File, ){

    }

}




