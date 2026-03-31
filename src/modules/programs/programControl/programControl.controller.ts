// src/modules/programs/program-lock.controller.ts
import {
  Controller, Get, Patch, Param, Body,
  UseGuards, HttpCode, HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiBody, ApiProperty,
} from '@nestjs/swagger';
import { IsBoolean, IsArray, IsInt, Min, Max, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';

import { JwtAuthGuard }  from 'src/common/guards/jwt-auth.guard';
import { RolesGuard }    from 'src/common/guards/roles.guard';
import { Roles }         from 'src/common/decorators/roles.decorator';
import { CurrentUser }   from 'src/common/decorators/current-user.decorator';
import { ProgramLockService } from './programControl.service';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class SetLockDto {
  @ApiProperty({ example: true, description: 'true = lock (premium only) | false = unlock (free)' })
  @IsBoolean()
  lock!: boolean;
}

export class BulkWeekLockDto {
  @ApiProperty({ example: [1, 2, 3], description: 'Week numbers to lock/unlock' })
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(52)
    @IsInt({ each: true })
    @Min(1, { each: true })
    @Max(52, { each: true })
    weekNumbers: number[] = [];

  @ApiProperty({ example: true, description: 'true = lock | false = unlock' })
  @IsBoolean()
  lock!: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('🔐 Admin — Program Locks')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin/programs')
export class ProgramLockController {
  constructor(private readonly lockService: ProgramLockService) {}

  /**
   * GET /api/v1/admin/programs/:id/lock-status
   * See current lock state: program + all weeks.
   */
  @Get(':id/lock-status')
  @ApiOperation({
    summary: 'Get lock status (program + all weeks)',
    description:
      'Returns isPremium for the whole program and for each individual week.\n\n' +
      '`isPremium=true` = premium subscription required.\n' +
      '`isPremium=false` = free access.',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  getLockStatus(@Param('id') id: string) {
    return this.lockService.getLockStatus(id);
  }

  /**
   * PATCH /api/v1/admin/programs/:id/lock
   * Lock or unlock the ENTIRE program.
   *
   * lock=true  → isPremium=true on program + ALL weeks (cascade)
   * lock=false → isPremium=false on program only (weeks unchanged)
   */
  @Patch(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lock / Unlock entire program',
    description:
      '**`lock: true`** — Sets the whole program to premium-only.\n' +
      'Cascades to ALL weeks automatically.\n\n' +
      '**`lock: false`** — Unlocks the program header only.\n' +
      'Per-week locks are preserved (to also unlock all weeks, use `/weeks/lock-all`).',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiBody({ type: SetLockDto })
  setProgramLock(
    @Param('id') id: string,
    @Body() dto: SetLockDto,
    @CurrentUser() user: any,
  ) {
    return this.lockService.setProgramLock(id, dto.lock, user.id);
  }

  /**
   * PATCH /api/v1/admin/programs/:id/weeks/:weekNumber/lock
   * Lock or unlock a SINGLE week.
   */
  @Patch(':id/weeks/:weekNumber/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lock / Unlock a single week',
    description:
      'Controls access to one specific week.\n\n' +
      '`lock: true` → week requires premium subscription.\n' +
      '`lock: false` → week is freely accessible (even if program is locked).',
  })
  @ApiParam({ name: 'id',         description: 'Program ID' })
  @ApiParam({ name: 'weekNumber', description: 'Week number (1-based)', type: Number })
  @ApiBody({ type: SetLockDto })
  setWeekLock(
    @Param('id')                                id:         string,
    @Param('weekNumber', ParseIntPipe) weekNumber: number,
    @Body() dto: SetLockDto,
    @CurrentUser() user: any,
  ) {
    return this.lockService.setWeekLock(id, weekNumber, dto.lock, user.id);
  }

  /**
   * PATCH /api/v1/admin/programs/:id/weeks/bulk-lock
   * Lock or unlock SPECIFIC weeks in one call.
   * Body: { weekNumbers: [1,2,3], lock: true }
   */
  @Patch(':id/weeks/bulk-lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk lock / unlock specific weeks',
    description:
      'Lock or unlock multiple weeks in a single atomic operation.\n\n' +
      'Example: free weeks 1-2, lock weeks 3-10:\n' +
      '```json\n{ "weekNumbers": [3,4,5,6,7,8,9,10], "lock": true }\n```',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiBody({ type: BulkWeekLockDto })
  bulkWeekLock(
    @Param('id') id: string,
    @Body() dto: BulkWeekLockDto,
    @CurrentUser() user: any,
  ) {
    return this.lockService.bulkSetWeekLock(id, dto.weekNumbers, dto.lock, user.id);
  }

  /**
   * PATCH /api/v1/admin/programs/:id/weeks/lock-all
   * Lock or unlock ALL weeks at once.
   * Body: { lock: true } | { lock: false }
   */
  @Patch(':id/weeks/lock-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lock / Unlock ALL weeks',
    description:
      'Applies the same lock state to every week in the program.\n\n' +
      '`lock: true` → all weeks become premium-only.\n' +
      '`lock: false` → all weeks become freely accessible.',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiBody({ type: SetLockDto })
  setAllWeeksLock(
    @Param('id') id: string,
    @Body() dto: SetLockDto,
    @CurrentUser() user: any,
  ) {
    return this.lockService.setAllWeeksLock(id, dto.lock, user.id);
  }
}