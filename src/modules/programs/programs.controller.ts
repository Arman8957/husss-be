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
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 }, // exercise image
        { name: 'animationFile', maxCount: 1 }, // exercise animation / video
      ],
      {
        storage: memoryStorage(),
        limits: {
          fileSize: 50 * 1024 * 1024, // 50MB — Cloudinary will reject oversized files with a clear error
          files: 2,
        },
        fileFilter: (
          _req: any,
          file: Express.Multer.File,
          cb: (error: Error | null, acceptFile: boolean) => void,
        ) => {
          // ✅ Only check file type here (NOT size — size is unknown at filter time in multer)
          // Use cb(null, false) to silently reject invalid types.
          // We validate accepted files in the handler below with proper error messages.
          if (file.fieldname === 'file') {
            const valid = /\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname);
            return cb(null, valid);
          }
          if (file.fieldname === 'animationFile') {
            // ✅ Accept gif, mp4, webm, mov for animation
            const valid = /\.(gif|mp4|webm|mov)$/i.test(file.originalname);
            return cb(null, valid);
          }
          cb(null, false);
        },
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '③ Add Exercise to Day',
    description: `
**Content-Type: multipart/form-data**
 
Send exercise JSON in the \`data\` field. Optionally attach files.
 
| Form field      | Type | Required | Description                                      |
|-----------------|------|----------|--------------------------------------------------|
| data            | Text | ✅ Yes    | JSON string of AddExerciseToDayDto               |
| file            | File | ❌ No     | Exercise image (jpg/png/webp/gif, max 5MB)       |
| animationFile   | File | ❌ No     | Animation/video (gif/mp4/webm/mov, max 20MB)     |
 
**4 supported modes:**
1. **File upload only** — upload file(s), no URL in JSON
2. **URL in JSON only** — pass \`exerciseImageUrl\` / \`exerciseAnimationUrl\` in data, no file
3. **Both file + URL** — file upload takes precedence over JSON URL
4. **Neither** — valid for library exercises (exerciseId provided)
 
**tabType:** \`MAIN_EXERCISE\` | \`BFR_EXERCISE\` | \`ABS_EXERCISE\`
`,
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiParam({ name: 'dayId', description: 'ProgramDay ID' })
  async addExercise(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @UploadedFiles()
    files:
      | { file?: Express.Multer.File[]; animationFile?: Express.Multer.File[] }
      | undefined,
    @Body('data') dataJson: string,
    @CurrentUser() user: any,
  ) {
    // ── 1. Parse JSON payload ────────────────────────────────────────────────
    if (!dataJson) {
      throw new BadRequestException(
        "Missing 'data' field. Send JSON as a text form-data field named 'data'.",
      );
    }

    let dto: AddExerciseToDayDto;
    try {
      dto = JSON.parse(dataJson);
    } catch {
      throw new BadRequestException(
        'Invalid JSON in "data" field. Ensure it is a valid JSON string.',
      );
    }

    // ── 2. Extract uploaded files ─────────────────────────────────────────────
    const rawFiles = files ?? {};
    const imageFile = rawFiles.file?.[0];
    const animFile = rawFiles.animationFile?.[0];

    // Secondary type validation (fileFilter silently rejected, give clear HTTP error)
    if (
      imageFile &&
      !/\.(jpg|jpeg|png|webp|gif)$/i.test(imageFile.originalname)
    ) {
      throw new BadRequestException(
        `Invalid image type: ${imageFile.originalname}. Allowed: jpg, png, webp, gif`,
      );
    }
    if (animFile && !/\.(gif|mp4|webm|mov)$/i.test(animFile.originalname)) {
      throw new BadRequestException(
        `Invalid animation type: ${animFile.originalname}. Allowed: gif, mp4, webm, mov`,
      );
    }

    // Enforce practical size limits AFTER multer buffers the file
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB for static images
    const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // 20MB for animations/videos

    if (imageFile && imageFile.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image file too large: ${(imageFile.size / 1024 / 1024).toFixed(1)}MB. Max: 5MB`,
      );
    }
    if (animFile && animFile.size > MAX_VIDEO_BYTES) {
      throw new BadRequestException(
        `Animation file too large: ${(animFile.size / 1024 / 1024).toFixed(1)}MB. Max: 20MB`,
      );
    }

    // ── 3. Upload files to Cloudinary in PARALLEL ─────────────────────────────
    //
    // ✅ KEY FIX: use uploadFileFromBuffer() not uploadImageFromBuffer()
    //    uploadFileFromBuffer() auto-detects resource_type from filename:
    //      .mp4/.webm/.mov → resource_type: 'video'   (was failing with 'image')
    //      .jpg/.png/.gif  → resource_type: 'image'
    //
    // Priority: uploaded file > URL from JSON data
    //
    const [imageResult, animResult] = await Promise.all([
      imageFile
        ? this.cloudinaryService.uploadFileFromBuffer(
            imageFile.buffer,
            'exercises/images',
            `exercise-img-${Date.now()}-${imageFile.originalname.replace(/[^a-z0-9.]/gi, '-')}`,
            imageFile.originalname,
          )
        : Promise.resolve(null),

      animFile
        ? this.cloudinaryService.uploadFileFromBuffer(
            animFile.buffer,
            /\.(mp4|webm|mov)$/i.test(animFile.originalname)
              ? 'exercises/videos'
              : 'exercises/animations',
            `exercise-anim-${Date.now()}-${animFile.originalname.replace(/[^a-z0-9.]/gi, '-')}`,
            animFile.originalname,
          )
        : Promise.resolve(null),
    ]);

    // ── 4. Resolve final URLs ──────────────────────────────────────────────────
    //
    // Rule: uploaded file URL takes precedence over JSON URL.
    // If no file uploaded, JSON URL passes through unchanged (already in dto).
    //
    if (imageResult) {
      dto.exerciseImageUrl = imageResult.secure_url;
    }
    // If no file but URL was in JSON — dto.exerciseImageUrl is already set from JSON.parse ✅

    if (animResult) {
      dto.exerciseAnimationUrl = animResult.secure_url;
    }
    // If no file but URL was in JSON — dto.exerciseAnimationUrl is already set from JSON.parse ✅

    // ── 5. Call service ───────────────────────────────────────────────────────
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
