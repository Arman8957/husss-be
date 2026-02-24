import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ExecutionNoteService } from './execution-note.service';
import { CreateExecutionNoteDto } from './dto/create-execution-note.dto';
import { UpdateExecutionNoteDto } from './dto/update-execution-note.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@ApiTags('Execution Notes')
@Controller('execution-note')
export class ExecutionNoteController {
  constructor(private readonly executionNoteService: ExecutionNoteService) { }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Create execution note (only can admin)' })
  @ApiResponse({ status: 201, description: 'Execution note created successfully' })
  create(@Body() dto: CreateExecutionNoteDto) {
    return this.executionNoteService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all execution notes' })
  findAll() {
    return this.executionNoteService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single execution note by ID' })
  findOne(@Param('id') id: string) {
    return this.executionNoteService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Update execution note (only can admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExecutionNoteDto,
  ) {
    return this.executionNoteService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Delete execution note (only can admin)' })
  remove(@Param('id') id: string) {
    return this.executionNoteService.remove(id);
  }
}