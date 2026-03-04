import { Injectable, NotFoundException } from '@nestjs/common';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSupplementProductDto } from './dto/create-supplement-product.dto';
import { UpdateSupplementProductDto } from './dto/update-supplement-product.dto';

@Injectable()
export class SupplimentProductService {

    constructor(private readonly cloudinaryService: CloudinaryService, private readonly prisma: PrismaService) { }

    async AddSupplimentProduct(imageUrl: Express.Multer.File, data: CreateSupplementProductDto) {

        const uploadImage: any = await this.cloudinaryService.uploadImageFromBuffer(imageUrl.buffer, "suppliment", `suppliment-${Date.now()}-${Math.random()}`);

        const result = await this.prisma.supplementProduct.create({
            data: {
                imageUrl: uploadImage.secure_url,
                ...data
            }
        });
        return result;
    };


    async getAllSupplimentProduct(page: number = 1, limit: number = 10, search?: string, category?: string) {
        const skip = (page - 1) * limit;

        const where: any = {};

        if (search) {
            where.OR = [
                {
                    name: {
                        contains: search,
                        mode: 'insensitive',
                    },
                },
                {
                    vendorName: {
                        contains: search,
                        mode: 'insensitive',
                    },
                },
            ];
        }

        if (category) {
            where.category = category;
        }

        const data = await this.prisma.supplementProduct.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                createdAt: 'desc',
            },
        });

        const total = await this.prisma.supplementProduct.count({ where });

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }


    async getSingleSupplimentProduct(productId: string) {
        const product = await this.prisma.supplementProduct.findUnique({
            where: {
                id: productId
            }
        });

        if (!product) throw new NotFoundException("Suppliment product not found");
        return product;
    };

    async deleteProduct(productId: string) {
        const findProduct = await this.prisma.supplementProduct.findUnique({ where: { id: productId } });

        if (!findProduct) throw new NotFoundException("Product not found");


        const result = await this.prisma.supplementProduct.delete({
            where: {
                id: productId
            }
        });

        return true;

    }


    async updateSupplementProduct(productId: string, image: Express.Multer.File, data: UpdateSupplementProductDto) {
        const findProduct = await this.prisma.supplementProduct.findUnique({
            where: { id: productId },
        });

        if (!findProduct)
            throw new NotFoundException('Supplement product not found');

        let imageUrl = findProduct.imageUrl;

        if (image) {
            const uploadImage: any =
                await this.cloudinaryService.uploadImageFromBuffer(
                    image.buffer,
                    'suppliment',
                    `suppliment-${Date.now()}-${Math.random()}`,
                );

            imageUrl = uploadImage.secure_url;
        }

        const updatedProduct =
            await this.prisma.supplementProduct.update({
                where: { id: productId },
                data: {
                    ...data,
                    imageUrl,
                },
            });

        return updatedProduct;
    }

}




