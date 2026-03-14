import { Controller, Get, Query } from '@nestjs/common';
import { ProgrammeService } from './programme.service';
import { ApiQuery } from '@nestjs/swagger';
import { ProgramDifficulty, ProgramType } from '@prisma/client';

@Controller('content-management-programme-programme')
export class ProgrammeController {
  constructor(private readonly programmeService: ProgrammeService) { }

  @Get('all-programme')
  // @ApiOperation({ summary: 'Get all programs with pagination, search and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or description' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'isPublished', required: false, type: Boolean })
  @ApiQuery({ name: 'isPremium', required: false, type: Boolean })
  @ApiQuery({ name: 'type', required: false, enum: ProgramType })
  @ApiQuery({ name: 'difficulty', required: false, enum: ProgramDifficulty })
  async getAllPrograms(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('isActive') isActive?: boolean,
    @Query('isPublished') isPublished?: boolean,
    @Query('isPremium') isPremium?: boolean,
    @Query('type') type?: ProgramType,
    @Query('difficulty') difficulty?: ProgramDifficulty
  ) {

    const filters: any = {};
    if (isActive !== undefined) filters.isActive = isActive;
    if (isPublished !== undefined) filters.isPublished = isPublished;
    if (isPremium !== undefined) filters.isPremium = isPremium;
    if (type) filters.type = type;
    if (difficulty) filters.difficulty = difficulty;

    return this.programmeService.getAllProgramme(
      Number(page) || 1,
      Number(limit) || 10,
      search,
      filters
    );
  }

}
