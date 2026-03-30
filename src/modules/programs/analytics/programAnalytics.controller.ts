// src/modules/programs/program-analytics.controller.ts
import {
  Controller, Get, Post, Param, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery,
} from '@nestjs/swagger';

import { JwtAuthGuard }  from 'src/common/guards/jwt-auth.guard';
import { RolesGuard }    from 'src/common/guards/roles.guard';
import { Roles }         from 'src/common/decorators/roles.decorator';
import { ProgramAnalyticsService } from './programAnalytics.service';

@ApiTags('📊 Admin — Program Analytics')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
@Controller('admin/programs/analytics')
export class ProgramAnalyticsController {
  constructor(private readonly analyticsService: ProgramAnalyticsService) {}

  /**
   * GET /api/v1/admin/programs/analytics/summary
   * Summary cards for the Program Management header:
   *   - Total Programs
   *   - Active Enrollments
   *   - Premium Programs count
   *   - Avg Completion %
   */
  @Get('summary')
  @ApiOperation({
    summary: 'Program Management summary cards',
    description:
      'Returns: totalPrograms, activeEnrollments, premiumPrograms, avgCompletion.\n\n' +
      'Used by: the 4 cards at the top of the Program Management screen.',
  })
  getSummary() {
    return this.analyticsService.getSummary();
  }

  /**
   * GET /api/v1/admin/programs/analytics/top-enrollments?limit=10
   * Top programs by total enrollments — "Enrollment Programs" section.
   */
  @Get('top-enrollments')
  @ApiOperation({
    summary: 'Top programs by enrollment (bar chart)',
    description: 'Returns programs sorted by totalEnrollments descending. Used by "Enrollment Programs" section.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  getTopByEnrollment(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.analyticsService.getTopByEnrollment(limit);
  }

  /**
   * GET /api/v1/admin/programs/analytics/performance?page=1&limit=20
   * Full performance breakdown table with all programs.
   * Returns: name, type, enrollments, activeUsers, completionRate, estimatedRevenue, trend
   */
  @Get('performance')
  @ApiOperation({
    summary: 'Program Performance Breakdown table',
    description:
      'Full table with all programs. Returns per-program:\n' +
      '- enrollments, activeUsers, completionRate, completedCount\n' +
      '- estimatedRevenue (proportional share of total Stripe revenue)\n' +
      '- trend: GROWING / STABLE / DECLINING\n\n' +
      'Used by: "Program Performance Breakdown" table.',
  })
  @ApiQuery({ name: 'page',  required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  getPerformanceBreakdown(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.analyticsService.getPerformanceBreakdown(page, limit);
  }

  /**
   * GET /api/v1/admin/programs/analytics/:programId
   * Detailed stats for a single program — completion funnel + week distribution.
   */
  @Get(':programId')
  @ApiOperation({
    summary: 'Single program detailed analytics',
    description: 'Returns: enrollment funnel (enrolled→active→completed→dropped), week distribution.',
  })
  @ApiParam({ name: 'programId', description: 'Program ID' })
  getProgramStats(@Param('programId') programId: string) {
    return this.analyticsService.getProgramStats(programId);
  }

  /**
   * POST /api/v1/admin/programs/analytics/:programId/recalculate
   * Recalculate analytics from live data for one program.
   * Call after bulk imports or data corrections.
   */
  @Post(':programId/recalculate')
  @ApiOperation({
    summary: 'Recalculate analytics from live DB data',
    description: 'Recomputes totalEnrollments, activeEnrollments, completionRate from source tables.',
  })
  @ApiParam({ name: 'programId', description: 'Program ID' })
  recalculate(@Param('programId') programId: string) {
    return this.analyticsService.recalculate(programId);
  }
}