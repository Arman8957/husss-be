import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { SupplimentProductService } from './suppliment-product.service';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateSupplementProductDto } from './dto/create-supplement-product.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { SupplementCategory } from '@prisma/client';
import { UpdateSupplementProductDto } from './dto/update-supplement-product.dto';

@Controller('suppliment-product')
export class SupplimentProductController {
  constructor(private readonly supplimentProductService: SupplimentProductService) { }

  @Post('create')
  @ApiOperation({ summary: 'Create Supplement Product' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: {
          type: 'string',
          enum: ['FOUNDATION', 'PERFORMANCE', 'RECOVERY', 'OPTIONAL'],
        },
        price: { type: 'number' },
        vendorName: { type: 'string' },
        purchasePageUrl: { type: 'string' },
        benefits: {
          type: 'array',
          items: { type: 'string' },
        },
        image: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['name', 'category', 'price', 'purchasePageUrl', 'image'],
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async createSupplement(
    @UploadedFile() image: Express.Multer.File,
    @Body() body: CreateSupplementProductDto,
  ) {
    const result = await this.supplimentProductService.AddSupplimentProduct(image, body);
    return {
      message: "Suppliment Product Published",
      data: result
    }
  }


  @Get()
  @ApiOperation({ summary: 'Get all supplement products with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10, description: 'Number of items per page (default: 10)' })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'protein', description: 'Search by product name or vendor name' })
  @ApiQuery({ name: 'category', required: false, enum: SupplementCategory, type: String, example: SupplementCategory.FOUNDATION, description: 'Filter by supplement category' })
  @ApiResponse({
    status: 200,
    description: 'Supplement product list retrieved successfully',
  })
  getAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.supplimentProductService.getAllSupplimentProduct(
      Number(page),
      Number(limit),
      search,
      category,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Single Supplement Product' })
  @ApiParam({
    name: 'id',
    example: 'clx123abc456',
    description: 'Supplement Product ID',
  })
  @ApiResponse({ status: 200, description: 'Product found successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getSingleProduct(@Param('id') id: string) {
    return this.supplimentProductService.getSingleSupplimentProduct(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete Supplement Product' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiParam({
    name: 'id',
    example: 'clx123abc456',
    description: 'Supplement Product ID',
  })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async deleteProduct(@Param('id') id: string) {
    return this.supplimentProductService.deleteProduct(id);
  }


  @Patch(':id')
  @ApiOperation({ summary: 'Update Supplement Product' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiParam({
    name: 'id',
    example: 'clx123abc456',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: {
          type: 'string',
          enum: ['FOUNDATION', 'PERFORMANCE', 'RECOVERY', 'OPTIONAL'],
        },
        price: { type: 'number' },
        vendorName: { type: 'string' },
        purchasePageUrl: { type: 'string' },
        benefits: {
          type: 'array',
          items: { type: 'string' },
        },
        image: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async updateSupplement(
    @Param('id') id: string,
    @UploadedFile() image: Express.Multer.File,
    @Body() body: UpdateSupplementProductDto,
  ) {
    const result =
      await this.supplimentProductService.updateSupplementProduct(
        id,
        image,
        body,
      );

    return {
      message: 'Supplement Product Updated Successfully',
      data: result,
    };
  }

}
