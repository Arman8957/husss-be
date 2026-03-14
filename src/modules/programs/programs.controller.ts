// src/programs/programs.controller.ts

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
  BadRequestException,
  ParseFilePipeBuilder,
  UploadedFile,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { ProgramsService } from './programs.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import {
  ActivateProgramDto,
  AddExerciseToDayDto,
  CopyProgramDto,
  CreateProgramDto,
  ProgramQueryDto,
  PublishProgramDto,
  ReorderExercisesDto,
  SaveDaySplitDto,
  UpdateExerciseInDayDto,
  UpdateProgramDto,
} from './dto/programs.dto';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { memoryStorage } from 'multer';

// ─── ADMIN CONTROLLER ────────────────────────────────────────────────────────
@ApiTags(' Admin — Programs')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/programs')
export class AdminProgramsController {
  constructor(
    private readonly programsService: ProgramsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ── Step 1 ───────────────────────────────────────────────────────────────
  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '① Create Program — Basic Info',
    description:
      'Creates a new DRAFT program (isPublished=false). Returns the program ID needed for subsequent steps.',
  })
  @ApiResponse({
    status: 201,
    description: 'Program draft created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  create(@Body() dto: CreateProgramDto, @CurrentUser() user: any) {
    return this.programsService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({
    summary: '① Update Program — Basic Info',
    description:
      'Partial update of basic program info. Only provided fields are changed.',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProgramDto,
    @CurrentUser() user: any,
  ) {
    return this.programsService.update(id, dto, user.id);
  }

  // ── Step 2 ───────────────────────────────────────────────────────────────
  @Post(':id/day-split')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '② Save Day Split Configuration',
    description: `Saves week/day structure. DESTRUCTIVE per week: resubmitting Week 1 replaces all Week 1 days and their exercises.
    
    Training method types: FIVE_BY_FIVE | MAX_OT | BULLDOZER | BURNS | GIRONDA_8X8 | TEN_BY_THREE | HIGH_REP_20_REP_SQUAT | YATES_HIGH_INTENSITY | WESTSIDE_CONJUGATE | MODERATE_VOLUME | SINGLES_DOUBLES_TRIPLES | ACTIVATION | CUSTOM
    
    Requirements: Training methods must be seeded in the DB first.`,
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  saveDaySplit(
    @Param('id') id: string,
    @Body() dto: SaveDaySplitDto,
    @CurrentUser() user: any,
  ) {
    return this.programsService.saveDaySplit(id, dto, user.id);
  }

  // ── Step 3 ───────────────────────────────────────────────────────────────
  @Get(':id/days/:dayId/exercises')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({
    summary: '③ Get Day Exercises (grouped by tab)',
    description:
      'Returns mainExercises, bfrExercises, absExercises arrays for the Add Exercise modal.',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiParam({ name: 'dayId', description: 'ProgramDay ID' })
  getDayExercises(@Param('id') id: string, @Param('dayId') dayId: string) {
    return this.programsService.getDayExercises(id, dayId);
  }

  @Post(':id/days/:dayId/exercises')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @HttpCode(HttpStatus.CREATED)
  // ✅ Accept two named file fields: 'file' (image) + 'animationFile' (gif/mp4)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 }, // exercise static image
        { name: 'animationFile', maxCount: 1 }, // exercise animation / gif
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB hard limit (animation can be large)
        fileFilter: (
          _req: any,
          file: Express.Multer.File,
          cb: (error: Error | null, acceptFile: boolean) => void,
        ) => {
          // image field: jpg / png / webp / gif
          if (file.fieldname === 'file') {
            if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname)) {
              return cb(
                new BadRequestException('file must be jpg, png, webp, or gif'),
                false,
              );
            }
            if (file.size > 5 * 1024 * 1024) {
              return cb(
                new BadRequestException('file exceeds 5MB limit'),
                false,
              );
            }
          }
          // animation field: gif / mp4 / webm / mov
          if (file.fieldname === 'animationFile') {
            if (!/\.(gif|mp4|webm|mov)$/i.test(file.originalname)) {
              return cb(
                new BadRequestException(
                  'animationFile must be gif, mp4, webm, or mov',
                ),
                false,
              );
            }
          }
          cb(null, true);
        },
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '③ Add Exercise to Day',
    description: `
**Content-Type: multipart/form-data**
 
Send the exercise payload as a JSON string in the \`data\` field.
Optionally attach image and/or animation files.
 
| Form field      | Type | Required | Description                                 |
|-----------------|------|----------|---------------------------------------------|
| data            | Text | ✅ Yes    | JSON string — full AddExerciseToDayDto      |
| file            | File | ❌ No     | Exercise image (jpg/png/webp/gif, max 5MB)  |
| animationFile   | File | ❌ No     | Animation/gif (gif/mp4/webm/mov, max 20MB)  |
 
**tabType values:**
- \`MAIN_EXERCISE\` — regular exercise (shows in main tab)
- \`BFR_EXERCISE\`  — blood flow restriction finisher
- \`ABS_EXERCISE\`  — abs workout
 
**Two modes for the exercise:**
1. Pick from library: include \`exerciseId\` in the JSON data
2. Create inline: include \`exerciseName\` (+ optional description/for/image)
`,
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiParam({ name: 'dayId', description: 'ProgramDay ID' })
  async addExercise(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    // ✅ Both files arrive in a single decorated object
    @UploadedFiles()
    files: {
      file?: Express.Multer.File[];
      animationFile?: Express.Multer.File[];
    },
    @Body('data') dataJson: string,
    @CurrentUser() user: any,
  ) {
    // ── Parse JSON payload ─────────────────────────────────────────────────
    if (!dataJson) {
      throw new BadRequestException(
        'Missing \'data\' field. Send exercise JSON as: data=\'{"tabType":"MAIN_EXERCISE",...}\'',
      );
    }

    let dto: AddExerciseToDayDto;
    try {
      dto = JSON.parse(dataJson);
    } catch {
      throw new BadRequestException(
        'Invalid JSON in "data" field. Make sure it is a valid JSON string.',
      );
    }

    // ── Upload exercise image if provided ──────────────────────────────────
    const imageFile = files?.file?.[0];
    if (imageFile) {
      const result = await this.cloudinaryService.uploadImageFromBuffer(
        imageFile.buffer,
        'exercises/images',
        `exercise-img-${Date.now()}-${imageFile.originalname.replace(/[^a-z0-9.]/gi, '-')}`,
      );
      // Override any URL the client sent — uploaded file takes precedence
      dto.exerciseImageUrl = result.secure_url;
    }

    // ── Upload animation file if provided ─────────────────────────────────
    const animFile = files?.animationFile?.[0];
    if (animFile) {
      const isVideo = /\.(mp4|webm|mov)$/i.test(animFile.originalname);
      const result = await this.cloudinaryService.uploadImageFromBuffer(
        animFile.buffer,
        isVideo ? 'exercises/videos' : 'exercises/animations',
        `exercise-anim-${Date.now()}-${animFile.originalname.replace(/[^a-z0-9.]/gi, '-')}`,
      );
      dto.exerciseAnimationUrl = result.secure_url;
    }

    return this.programsService.addExerciseToDay(id, dayId, dto, user.id);
  }

  @Patch(':id/days/:dayId/exercises/:pdeId')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({
    summary: '③ Update Exercise Assignment',
    description:
      'Update sets, reps, type, or metadata of an exercise in a day.',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiParam({ name: 'dayId', description: 'ProgramDay ID' })
  @ApiParam({ name: 'pdeId', description: 'ProgramDayExercise ID' })
  updateExercise(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Param('pdeId') pdeId: string,
    @Body() dto: UpdateExerciseInDayDto,
    @CurrentUser() user: any,
  ) {
    return this.programsService.updateExerciseInDay(
      id,
      dayId,
      pdeId,
      dto,
      user.id,
    );
  }

  @Delete(':id/days/:dayId/exercises/:pdeId')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '③ Remove Exercise from Day' })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiParam({ name: 'dayId', description: 'ProgramDay ID' })
  @ApiParam({ name: 'pdeId', description: 'ProgramDayExercise ID' })
  removeExercise(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Param('pdeId') pdeId: string,
    @CurrentUser() user: any,
  ) {
    return this.programsService.removeExerciseFromDay(
      id,
      dayId,
      pdeId,
      user.id,
    );
  }

  @Patch(':id/days/:dayId/exercises/reorder')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({
    summary: '③ Reorder Exercises',
    description:
      'Submit all exercise IDs in the desired order. Assigns sortOrder 0,1,2…',
  })
  reorderExercises(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body() dto: ReorderExercisesDto,
    @CurrentUser() user: any,
  ) {
    return this.programsService.reorderExercises(id, dayId, dto, user.id);
  }

  // ── Step 4 ───────────────────────────────────────────────────────────────
  @Get(':id/review')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({
    summary: '④ Get Review Summary',
    description:
      'Returns program review shape matching the Review & Publish UI (Image 1). Shows all weeks, days, methods, exercises.',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  getReview(@Param('id') id: string) {
    return this.programsService.getReview(id);
  }

  @Patch(':id/publish')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: '④ Publish / Unpublish Program',
    description:
      'publish:true makes it visible in user library. Requires at least one exercise.',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  publish(
    @Param('id') id: string,
    @Body() dto: PublishProgramDto,
    @CurrentUser() user: any,
  ) {
    return this.programsService.publish(id, dto, user.id);
  }

  // ── Management ────────────────────────────────────────────────────────────
  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'List all programs (paginated + filtered)' })
  findAll(@Query() query: ProgramQueryDto) {
    return this.programsService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Get full program with all weeks, days, exercises' })
  @ApiParam({ name: 'id', description: 'Program ID' })
  findOne(@Param('id') id: string) {
    return this.programsService.findOne(id);
  }

  @Post(':id/copy')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Deep copy program',
    description:
      'Creates full copy (weeks → days → exercises → sets) as a new DRAFT.',
  })
  @ApiParam({ name: 'id', description: 'Source program ID' })
  copy(
    @Param('id') id: string,
    @Body() dto: CopyProgramDto,
    @CurrentUser() user: any,
  ) {
    return this.programsService.copy(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete program',
    description:
      'Hard delete. Blocked if any user has the program active. Archive with isActive=false instead.',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.programsService.remove(id, user.id);
  }
}

// ─── USER CONTROLLER ─────────────────────────────────────────────────────────
@ApiTags('👤 User — Programs')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('programs')
export class UserProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Get('library')
  @ApiOperation({
    summary: 'Get Program Library',
    description:
      'Returns all published programs. isLocked=true means premium required. isActiveForUser=true means this is the current program.',
  })
  getLibrary(@CurrentUser() user: any) {
    return this.programsService.getLibrary(user.id);
  }

  @Post('activate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Activate Program',
    description:
      "Sets a program as the user's active program. Resets to week 1, day 1.",
  })
  activate(@Body() dto: ActivateProgramDto, @CurrentUser() user: any) {
    return this.programsService.activateProgram(user.id, dto);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Get Active Program',
    description:
      'Returns the full active program with current week/day position and all exercises.',
  })
  getActive(@CurrentUser() user: any) {
    return this.programsService.getUserActiveProgram(user.id);
  }

  @Delete('active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate Current Program' })
  deactivate(@CurrentUser() user: any) {
    return this.programsService.deactivateProgram(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View a published program by ID' })
  @ApiParam({ name: 'id', description: 'Program ID' })
  findOne(@Param('id') id: string) {
    return this.programsService.findOne(id);
  }
}
