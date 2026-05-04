import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // optional
import { TrainingMethodsService } from './training-methods.service';

@ApiTags('🏋️ Training Methods')
@Controller('training-methods')
export class TrainingMethodsControllerForUser {
  constructor(private readonly service: TrainingMethodsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all active training methods',
    description: 'Public endpoint - returns all active training methods with labels for frontend dropdowns',
  })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean, example: true })
  findAll(@Query('activeOnly') activeOnly?: string) {
    const onlyActive = activeOnly !== 'false';
    return this.service.findAllPublic(onlyActive);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Training Method ID' })
  @ApiOperation({ summary: 'Get single training method by ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOnePublic(id);
  }
}