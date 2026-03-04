import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EssentialContentService } from './essential-content.service';
import { CreateEssentialContentDto } from './dto/create-essential-content.dto';
import { UpdateEssentialContentDto } from './dto/update-essential-content.dto';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

@ApiTags('Safety Disclaimer')
@Controller('essential-content')
export class EssentialContentController {
  constructor(
    private readonly essentialContentService: EssentialContentService,
  ) { }

  @Post()
  @ApiOperation({ summary: 'Create essential content (Only Can Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  create(@Body() dto: CreateEssentialContentDto) {
    return this.essentialContentService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all essential content (with search)' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@Query('search') search?: string) {
    return this.essentialContentService.findAll(search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single essential content' })
  findOne(@Param('id') id: string) {
    return this.essentialContentService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update essential content (Only Can Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEssentialContentDto,
  ) {
    return this.essentialContentService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete essential content (Only Can Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  remove(@Param('id') id: string) {
    return this.essentialContentService.remove(id);
  }
}