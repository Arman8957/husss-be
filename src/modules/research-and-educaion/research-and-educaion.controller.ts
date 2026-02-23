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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateResearchEducationDto } from './dto/create-research-education.dto';
import { UpdateResearchEducationDto } from './dto/update-research-education.dto';
import { QueryResearchEducationDto } from './dto/query-research-education.dto';
import { ResearchEducationService } from './research-and-educaion.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@ApiTags('Research & Education')
@Controller('research-education')
export class ResearchEducationController {
  constructor(
    private readonly researchEducationService: ResearchEducationService,
  ) { }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Publish Research & Education (only can admin)' })
  create(@Body() dto: CreateResearchEducationDto) {
    return this.researchEducationService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryResearchEducationDto) {
    return this.researchEducationService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.researchEducationService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Update Research & Education (only can admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateResearchEducationDto,
  ) {
    return this.researchEducationService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Delete Research & Education (only can admin)' })
  remove(@Param('id') id: string) {
    return this.researchEducationService.remove(id);
  }
}