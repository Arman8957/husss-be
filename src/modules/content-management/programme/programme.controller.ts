import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ProgrammeService } from './programme.service';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProgramDifficulty, ProgramType } from '@prisma/client';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

@Controller('content-management-programme-programme')
export class ProgrammeController {
  constructor(private readonly programmeService: ProgrammeService) { }

  @Get('all-programme')
  // @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
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
    @Query('isActive') isActive?: string,
    @Query('isPublished') isPublished?: string,
    @Query('isPremium') isPremium?: string,
    @Query('type') type?: ProgramType,
    @Query('difficulty') difficulty?: ProgramDifficulty
  ) {

    // Convert query strings to booleans
    const filters: any = {};
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (isPublished !== undefined) filters.isPublished = isPublished === 'true';
    if (isPremium !== undefined) filters.isPremium = isPremium === 'true';
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
