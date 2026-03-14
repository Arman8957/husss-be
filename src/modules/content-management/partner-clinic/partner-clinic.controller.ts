import {
  Controller,
  Post,
  Get,
  Param,
  Patch,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PartnerClinicService } from './partner-clinic.service';
import { CreatePartnerClinicDto } from './dto/create-partner-clinic.dto';
import { UpdatePartnerClinicDto } from './dto/update-partner-clinic.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@ApiTags('Partner Clinics')
@Controller('partner-clinics')
export class PartnerClinicController {
  constructor(private readonly service: PartnerClinicService) { }

  @Post()
  @ApiOperation({ summary: 'Create Partner Clinic (Only Can Admin)' })
  // @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiResponse({ status: 201, description: 'Created successfully' })
  async create(@Body() dto: CreatePartnerClinicDto) {
    return await this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get All Partner Clinics' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Single Partner Clinic' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Partner Clinic (Only Can Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePartnerClinicDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete Partner Clinic (Only Can Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}