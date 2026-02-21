// src/exercises/exercises.controller.ts

import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ExercisesService } from './exercises.service';
import { CreateExerciseDto, UpdateExerciseDto, ExerciseQueryDto } from './dto/exercise.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';


@ApiTags('🔐 Admin — Exercises')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/exercises')
export class AdminExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create Exercise',
    description: 'Add to global exercise library. Include media array for image/video/GIF.',
  })
  create(@Body() dto: CreateExerciseDto, @CurrentUser() user: any) {
    return this.exercisesService.create(dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'List all exercises (paginated + filtered)' })
  findAll(@Query() query: ExerciseQueryDto) {
    return this.exercisesService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Get exercise by ID' })
  @ApiParam({ name: 'id', description: 'Exercise ID' })
  findOne(@Param('id') id: string) {
    return this.exercisesService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({
    summary: 'Update exercise',
    description: 'Provide media array to replace all media. Omit media to leave unchanged.',
  })
  @ApiParam({ name: 'id', description: 'Exercise ID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExerciseDto,
    @CurrentUser() user: any,
  ) {
    return this.exercisesService.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete exercise',
    description: 'Hard delete if unused in published programs. Soft delete (isActive=false) otherwise.',
  })
  @ApiParam({ name: 'id', description: 'Exercise ID' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.exercisesService.remove(id, user.id);
  }
}

@ApiTags('👤 User — Exercises')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('exercises')
export class UserExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  @Get()
  @ApiOperation({ summary: 'Browse exercise library (published only)' })
  findAll(@Query() query: ExerciseQueryDto) {
    return this.exercisesService.findAll({ ...query, isPublished: true });
  }

  @Get('favorites')
  @ApiOperation({ summary: 'Get my favorite exercises' })
  getFavorites(@CurrentUser() user: any) {
    return this.exercisesService.getUserFavorites(user.id);
  }

  @Post(':id/favorite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle exercise favorite (add/remove)' })
  @ApiParam({ name: 'id', description: 'Exercise ID' })
  toggleFavorite(@Param('id') id: string, @CurrentUser() user: any) {
    return this.exercisesService.toggleFavorite(user.id, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get exercise details by ID' })
  @ApiParam({ name: 'id', description: 'Exercise ID' })
  findOne(@Param('id') id: string) {
    return this.exercisesService.findOne(id);
  }
}