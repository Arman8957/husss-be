import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { FreestyleService } from './freestyle.service';
import {
  CompleteFreestyleSessionDto,
  FreestyleSetupDto,
  LogFreestyleSetDto,
  StartFreestyleSessionDto,
} from './dto/freestyle.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
// import { FreestyleService }       from './freestyle.service';
// import { JwtAuthGuard }           from 'src/common/guards/jwt-auth.guard';
// import { CurrentUser }            from 'src/common/decorators/current-user.decorator';
// import { FreestyleSetupDto, StartFreestyleSessionDto, LogFreestyleSetDto, CompleteFreestyleSessionDto } from './dto/freestyle.dto';

@ApiTags('🏋️ Freestyle Workout')
@ApiBearerAuth('JWT-auth')
@UseGuards(/* JwtAuthGuard */)
@Controller('freestyle')
export class FreestyleController {
  constructor(private readonly freestyleService: FreestyleService) {}

  // ── Setup ─────────────────────────────────────────────────────────────────

  //   @Post('setup')
  //   @HttpCode(HttpStatus.CREATED)
  //   @ApiOperation({
  //     summary: 'Start Freestyle Mode',
  //     description: `
  // Configure and start freestyle mode. User picks program length (1–5 weeks).

  // **Body:**
  // \`\`\`json
  // {
  //   "programLengthWeeks": 3,
  //   "bfrEnabled": false,
  //   "absWorkoutType": "TWO_DAY"
  // }
  // \`\`\`

  // **Returns:** confirmation of setup.

  // **Resets:**
  // - All method cycle progress is cleared
  // - Week counter resets to 1
  //     `,
  //   })
  //   setup(@Body() dto: FreestyleSetupDto, @/* CurrentUser */ Param('user') user: any) {
  //     return this.freestyleService.setup(user?.id ?? '', dto);
  //   }

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start / Configure Freestyle Mode' })
  setup(
    @Body() dto: FreestyleSetupDto,
    @CurrentUser() user: any, // ← Correct way
  ) {
    return this.freestyleService.setup(user.id, dto);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get Freestyle Dashboard',
    description: `
Returns everything needed to render the Freestyle Workout screen:
 
- **lastSession** — date, dayType, method (shown in "Last Session" card)
- **methodCycleProgress** — per dayType: used/total, progress bar ("1/15")
- **availableDayTypes** — Push/Pull/Legs minus the last used (no consecutive rule)
- **trainingMethods** — full list with \`isUsedInCurrentCycle\` flag (checkmark in UI)
- **recentSessions** — last 10 sessions for the bottom row (Fri/9/Pl cards)
    `,
  })
  getDashboard(@/* CurrentUser */ Param('u') user: any) {
    return this.freestyleService.getDashboard(user?.id ?? '');
  }

  // ── Session ───────────────────────────────────────────────────────────────

  @Post('session/start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start Freestyle Session',
    description: `
User picks **Day Type** (Push/Pull/Legs) + **Training Method** → get exercises back.
 
**Business Rules enforced:**
1. ❌ Cannot repeat same dayType as last session
2. ✅ Returns exercises for the chosen muscles + training method prescription
3. ✅ Creates WorkoutLog (status=IN_PROGRESS)
 
**Body:**
\`\`\`json
{
  "dayType": "PUSH",
  "trainingMethod": "FIVE_BY_FIVE"
}
\`\`\`
 
**Day Types:**
- \`PUSH\` → Chest, Shoulders, Triceps
- \`PULL\` → Back, Biceps, Traps
- \`LEGS\` → Quads, Hamstrings, Glutes, Calves
 
**Training Methods (13 total):**
\`FIVE_BY_FIVE | MAX_OT | BULLDOZER | BURNS | GIRONDA_8X8 | TEN_BY_THREE |
HIGH_REP_20_REP_SQUAT | YATES_HIGH_INTENSITY | WESTSIDE_CONJUGATE |
MODERATE_VOLUME | SINGLES_DOUBLES_TRIPLES | ACTIVATION | CUSTOM\`
    `,
  })
  startSession(
    @Body() dto: StartFreestyleSessionDto,
    @/* CurrentUser */ Param('u') user: any,
  ) {
    return this.freestyleService.startSession(user?.id ?? '', dto);
  }

  @Get('session/active')
  @ApiOperation({
    summary: 'Get Active Session',
    description:
      'Returns current IN_PROGRESS freestyle session to allow resume. Returns null if none active.',
  })
  getActiveSession(@/* CurrentUser */ Param('u') user: any) {
    return this.freestyleService.getActiveSession(user?.id ?? '');
  }

  @Post('session/:sessionId/log-set')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Log a Set',
    description: `
Log one set during a freestyle session.
 
**Body:**
\`\`\`json
{
  "exerciseId": "cm...",
  "setNumber": 1,
  "plannedReps": 5,
  "actualReps": 5,
  "weight": 100,
  "setType": "NORMAL",
  "notes": "Felt strong"
}
\`\`\`
    `,
  })
  @ApiParam({
    name: 'sessionId',
    description: 'WorkoutLog ID from startSession',
  })
  logSet(
    @Param('sessionId') sessionId: string,
    @Body() dto: LogFreestyleSetDto,
    @/* CurrentUser */ Param('u') user: any,
  ) {
    return this.freestyleService.logSet(user?.id ?? '', sessionId, dto);
  }

  @Patch('session/:sessionId/complete')
  @ApiOperation({
    summary: 'Complete Session',
    description: `
Mark the session as COMPLETED.
 
**Updates:**
- WorkoutLog status → COMPLETED
- Method marked as used in cycle (for "Methods cycle" rule)
- lastDayType updated (enforces no-consecutive rule for next session)
- User totalWorkouts incremented
- Week auto-advances based on session count
- Full cycle auto-resets after programLengthWeeks × 5 sessions
 
**Body:**
\`\`\`json
{
  "durationSeconds": 3600,
  "notes": "Great session"
}
\`\`\`
    `,
  })
  @ApiParam({ name: 'sessionId', description: 'WorkoutLog ID' })
  completeSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: CompleteFreestyleSessionDto,
    @/* CurrentUser */ Param('u') user: any,
  ) {
    return this.freestyleService.completeSession(
      user?.id ?? '',
      sessionId,
      dto,
    );
  }

  @Patch('session/:sessionId/skip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Skip Session',
    description: 'Mark session as SKIPPED.',
  })
  @ApiParam({ name: 'sessionId', description: 'WorkoutLog ID' })
  skipSession(
    @Param('sessionId') sessionId: string,
    @/* CurrentUser */ Param('u') user: any,
  ) {
    return this.freestyleService.skipSession(user?.id ?? '', sessionId);
  }

  // ── History ───────────────────────────────────────────────────────────────

  @Get('history')
  @ApiOperation({
    summary: 'Get Freestyle Session History',
    description:
      'Returns paginated list of all freestyle sessions (newest first).',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  getHistory(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @/* CurrentUser */ Param('u') user: any,
  ) {
    return this.freestyleService.getHistory(
      user?.id ?? '',
      parseInt(page ?? '1', 10),
      parseInt(limit ?? '20', 10),
    );
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  @Delete('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset Freestyle Mode',
    description:
      'Clears all freestyle config (method cycles, week counter). Does NOT delete session history.',
  })
  reset(@/* CurrentUser */ Param('u') user: any) {
    return this.freestyleService.reset(user?.id ?? '');
  }
}
