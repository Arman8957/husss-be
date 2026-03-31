import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { HealthMarkersService } from './health-markers.service';
import {  ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CreateHealthMarkerDto } from './dto/create.health.marker';
import { UpdateHealthMarkerDto } from './dto/update.health.marker';

@Controller('health-markers')
export class HealthMarkersController {
  constructor(private readonly healthMarkersService: HealthMarkersService) { }

  @Post()
  @ApiOperation({ summary: 'Create health marker' })
  @ApiResponse({ status: 201, description: 'Created successfully' })
  create(@Body() data: CreateHealthMarkerDto) {
    return this.healthMarkersService.createHealthMarkers(data);
  }

  @Get()
  @ApiOperation({ summary: 'Get all health markers with pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    return this.healthMarkersService.getHealthMarkers(
      Number(page) || 1,
      Number(limit) || 10,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single health marker' })
  findOne(@Param('id') id: string) {
    return this.healthMarkersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update health marker' })
  update(
    @Param('id') id: string,
    @Body() data: UpdateHealthMarkerDto,
  ) {
    return this.healthMarkersService.updateHealthMarkers(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete health marker' })
  remove(@Param('id') id: string) {
    return this.healthMarkersService.deleteHealthMarkers(id);
  }

}
