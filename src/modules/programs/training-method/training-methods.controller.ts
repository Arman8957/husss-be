import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard }   from 'src/common/guards/roles.guard';
import { Roles }        from 'src/common/decorators/roles.decorator';
import { CurrentUser }  from 'src/common/decorators/current-user.decorator';
import { CreateTrainingMethodDto, UpdateTrainingMethodDto } from './dto/training-method.dto';
import { TrainingMethodsService } from './training-methods.service';
 
@ApiTags('🏋️ Admin — Training Methods')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin/training-methods')
export class TrainingMethodsController {
  constructor(private readonly service: TrainingMethodsService) {}
 
  @Get('types')
  @ApiOperation({ summary: 'Get METHOD_TYPES constant (value + label pairs for dropdowns)' })
  getTypes() { return this.service.getMethodTypes(); }
 
  @Get()
  @ApiOperation({ summary: 'Get all training methods' })
  findAll() { return this.service.findAll(); }
 
  @Get(':id')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Get single training method by ID' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
 
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create training method (one per type — unique)',
    description: '**One config per type only.**\nFails with 409 if that type already exists.\nDelete the existing one first to re-create.',
  })
  create(@Body() dto: CreateTrainingMethodDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }
 
  @Patch(':id')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update training method (partial)' })
  update(@Param('id') id: string, @Body() dto: UpdateTrainingMethodDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user.id);
  }
 
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary: 'Hard delete training method',
    description: '**Permanent — no soft delete.**\nBlocked if used in any program week.\nAfter deletion, the same type can be re-created via POST.',
  })
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
 