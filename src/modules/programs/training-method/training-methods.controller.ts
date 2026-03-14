// src/modules/training-methods/training-methods.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { TrainingMethodsService } from './training-methods.service';
import { CreateTrainingMethodDto, UpdateTrainingMethodDto, TrainingMethodQueryDto } from './dto/training-method.dto';
import { JwtAuthGuard }  from 'src/common/guards/jwt-auth.guard';
import { RolesGuard }    from 'src/common/guards/roles.guard';
import { Roles }         from 'src/common/decorators/roles.decorator';
import { CurrentUser }   from 'src/common/decorators/current-user.decorator';

// ── ADMIN ─────────────────────────────────────────────────────────────────────
@ApiTags('🔐 Admin — Training Methods')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/training-methods')
export class AdminTrainingMethodsController {
  constructor(private readonly service: TrainingMethodsService) {}

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create training method (5×5, Max-OT, Burns…)' })
  create(@Body() dto: CreateTrainingMethodDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({
    summary: 'List training methods',
    description: 'No filter → returns ALL (active + inactive).\n`?isActive=true` → active only.\n`?type=FIVE_BY_FIVE` → filter by type.',
  })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'type',     required: false })
  findAll(@Query() query: TrainingMethodQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Get training method by ID' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update training method (partial update)' })
  @ApiParam({ name: 'id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTrainingMethodDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete training method',
    description:
      '**Smart delete:**\n' +
      '- If in use by any program → soft-delete (`isActive=false`). Method still works for existing programs.\n' +
      '- If not in use → hard-delete permanently.\n\n' +
      'Response includes `softDeleted: true/false` so caller knows what happened.',
  })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.id);
  }
}

// ── USER (read-only) ─────────────────────────────────────────────────────────
@ApiTags('👤 User — Training Methods')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('training-methods')
export class UserTrainingMethodsController {
  constructor(private readonly service: TrainingMethodsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all active training methods (library view)' })
  findAll() {
    // Users only see active methods
    return this.service.findAll({ isActive: true });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get training method details' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}

// // src/training-methods/training-methods.controller.ts

// import {
//   Controller, Get, Post, Patch, Delete, Body, Param,
//   Query, UseGuards, HttpCode, HttpStatus,
// } from '@nestjs/common';
// import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
// import { TrainingMethodsService } from './training-methods.service';
// import {
//   CreateTrainingMethodDto, UpdateTrainingMethodDto, TrainingMethodQueryDto,
// } from './dto/training-method.dto';
// import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
// import { RolesGuard } from 'src/common/guards/roles.guard';
// import { Roles } from 'src/common/decorators/roles.decorator';
// import { CurrentUser } from 'src/common/decorators/current-user.decorator';


// @ApiTags(' Admin — Training Methods')
// @ApiBearerAuth('JWT-auth')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('admin/training-methods')
// export class AdminTrainingMethodsController {
//   constructor(private readonly service: TrainingMethodsService) {}

//   @Post()
//   @Roles('ADMIN', 'SUPER_ADMIN')
//   @HttpCode(HttpStatus.CREATED)
//   @ApiOperation({ summary: 'Create training method' })
//   create(@Body() dto: CreateTrainingMethodDto, @CurrentUser() user: any) {
//     return this.service.create(dto, user.id);
//   }

//   @Get()
//   @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
//   @ApiOperation({ summary: 'List all training methods' })
//   findAll(@Query() query: TrainingMethodQueryDto) {
//     return this.service.findAll(query);
//   }

//   @Get(':id')
//   @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
//   @ApiOperation({ summary: 'Get training method by ID' })
//   @ApiParam({ name: 'id' })
//   findOne(@Param('id') id: string) {
//     return this.service.findOne(id);
//   }

//   @Patch(':id')
//   @Roles('ADMIN', 'SUPER_ADMIN')
//   @ApiOperation({ summary: 'Update training method' })
//   @ApiParam({ name: 'id' })
//   update(@Param('id') id: string, @Body() dto: UpdateTrainingMethodDto, @CurrentUser() user: any) {
//     return this.service.update(id, dto, user.id);
//   }

//   @Delete(':id')
//   @Roles('ADMIN', 'SUPER_ADMIN')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({
//     summary: 'Delete training method',
//     description: 'Hard delete if unused. Soft delete (isActive=false) if in use by programs.',
//   })
//   @ApiParam({ name: 'id' })
//   remove(@Param('id') id: string, @CurrentUser() user: any) {
//     return this.service.remove(id, user.id);
//   }
// }

// @ApiTags('👤 User — Training Methods')
// @ApiBearerAuth('JWT-auth')
// @UseGuards(JwtAuthGuard)
// @Controller('training-methods')
// export class UserTrainingMethodsController {
//   constructor(private readonly service: TrainingMethodsService) {}

//   @Get()
//   @ApiOperation({ summary: 'Get all active training methods (with descriptions for library view)' })
//   findAll() {
//     return this.service.findAll({ isActive: true });
//   }

//   @Get(':id')
//   @ApiOperation({ summary: 'Get training method details' })
//   @ApiParam({ name: 'id' })
//   findOne(@Param('id') id: string) {
//     return this.service.findOne(id);
//   }
// }