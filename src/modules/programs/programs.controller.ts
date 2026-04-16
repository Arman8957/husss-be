// src/programs/programs.controller.ts
//
// ── ROOT CAUSE OF "POSTMAN ENCOUNTERED AN ERROR" CRASH ───────────────────────
//
// The crash is NOT a server error — it's Postman crashing on the REQUEST side.
// Causes:
//   1. Global ValidationPipe processes multipart/form-data body fields as strings,
//      causing unexpected validation errors that Postman's renderer can't display.
//   2. The `data` field JSON string with embedded quotes/special chars causes
//      Postman's form-data editor to crash when pasted incorrectly.
//   3. `@Body('data') dataJson: string` + global ValidationPipe interaction:
//      ValidationPipe tries to validate the raw JSON string as a DTO, fails silently.
//
// ── FIX: DUAL-MODE ENDPOINT ───────────────────────────────────────────────────
//
// The addExercise endpoint now supports TWO content types:
//
//   Mode 1 — application/json (NO files):
//     Send body as raw JSON. Use this when passing URLs in exerciseImageUrl/
//     exerciseAnimationUrl. Simpler, no Postman crashes, works with ValidationPipe.
//
//   Mode 2 — multipart/form-data (WITH files):
//     Send `data` as JSON string + optionally `file` and/or `animationFile`.
//     Use this when you want to upload actual image/video files.
//
// The controller detects which mode via Content-Type header automatically.
// ─────────────────────────────────────────────────────────────────────────────

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
  UseInterceptors,
  UploadedFiles,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiConsumes,
  ApiBody,
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
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';
import { memoryStorage } from 'multer';
import express from 'express';

// ─── ADMIN CONTROLLER ────────────────────────────────────────────────────────
@ApiTags('🔐 Admin — Programs')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/programs')
export class AdminProgramsController {
  constructor(
    private readonly programsService: ProgramsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ── Step 1: Create ────────────────────────────────────────────────────────
  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '① Create Program — Basic Info' })
  create(@Body() dto: CreateProgramDto, @CurrentUser() user: any) {
    return this.programsService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: '① Update Program — Basic Info' })
  @ApiParam({ name: 'id', description: 'Program ID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProgramDto,
    @CurrentUser() user: any,
  ) {
    return this.programsService.update(id, dto, user.id);
  }

  // ── Step 2: Day Split ─────────────────────────────────────────────────────
  @Post(':id/day-split')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '② Save Day Split Configuration' })
  @ApiParam({ name: 'id', description: 'Program ID' })
  saveDaySplit(
    @Param('id') id: string,
    @Body() dto: SaveDaySplitDto,
    @CurrentUser() user: any,
  ) {
    return this.programsService.saveDaySplit(id, dto, user.id);
  }

  // ── Step 3: Exercises ─────────────────────────────────────────────────────
  @Get(':id/days/:dayId/exercises')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({
    summary:
      '③ Get Day Exercises (mainExercises / bfrExercises / absExercises)',
  })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiParam({ name: 'dayId', description: 'ProgramDay ID' })
  getDayExercises(@Param('id') id: string, @Param('dayId') dayId: string) {
    return this.programsService.getDayExercises(id, dayId);
  }

  // ── ADD EXERCISE — DUAL MODE ──────────────────────────────────────────────
  //
  // MODE A: application/json  → body = AddExerciseToDayDto directly
  //         Use when: passing exerciseImageUrl / exerciseAnimationUrl as URLs
  //         How to test in Postman: Body → raw → JSON
  //
  // MODE B: multipart/form-data → body has `data` (JSON string) + optional files
  //         Use when: uploading actual image/video files from disk
  //         How to test in Postman: Body → form-data
  //           - data (Text): paste JSON string
  //           - file (File): select image from disk
  //           - animationFile (File): select video/gif from disk
  //
  // The controller auto-detects mode from Content-Type header.
  // ─────────────────────────────────────────────────────────────────────────

  @Post(':id/days/:dayId/exercises')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 }, // static image
        { name: 'animationFile', maxCount: 1 }, // gif / mp4 / webm
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 50 * 1024 * 1024, files: 2 }, // 50MB hard cap per file
        fileFilter: (
          _req: any,
          file: Express.Multer.File,
          cb: (error: Error | null, accept: boolean) => void,
        ) => {
          // Only check file TYPE here — size checked in handler after buffer is complete
          if (file.fieldname === 'file') {
            return cb(
              null,
              /\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname),
            );
          }
          if (file.fieldname === 'animationFile') {
            return cb(null, /\.(gif|mp4|webm|mov)$/i.test(file.originalname));
          }
          cb(null, false);
        },
      },
    ),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: '③ Add Exercise to Day',
    description: `
## Two ways to call this endpoint

### Mode A — Raw JSON (recommended when using URLs, NO file upload)
\`Content-Type: application/json\`

Send the full \`AddExerciseToDayDto\` as a regular JSON body.
Include \`exerciseImageUrl\` and/or \`exerciseAnimationUrl\` as URL strings.

**Use this in Postman:** Body → raw → JSON

\`\`\`json
{
  "tabType": "MAIN_EXERCISE",
  "exerciseName": "Dumbbell Flat Bench Press",
  "exerciseFor": "Chest",
  "exerciseImageUrl": "https://cdn.example.com/exercises/dbfbp-thumbnail.jpg",
  "exerciseAnimationUrl": "https://cdn.example.com/exercises/dbfbp-animation.mp4",
  "setType": "NORMAL",
  "isOptional": false,
  "sets": [
    { "setNumber": 1, "reps": "5", "restSeconds": 150 },
    { "setNumber": 2, "reps": "5", "restSeconds": 150 }
  ]
}
\`\`\`

---

### Mode B — form-data (when uploading actual files)
\`Content-Type: multipart/form-data\`

| Field         | Type | Notes                                          |
|---------------|------|------------------------------------------------|
| data          | Text | JSON string of the exercise payload (required) |
| file          | File | Image: jpg/png/webp/gif — max 5MB (optional)   |
| animationFile | File | Video: gif/mp4/webm/mov — max 20MB (optional)  |

**Use this in Postman:** Body → form-data
- Add key \`data\` (type: Text) — paste the JSON as a single-line string
- Add key \`file\` (type: File) — select image from disk  
- Add key \`animationFile\` (type: File) — select video/gif from disk

> ⚠️ In Postman form-data, the \`data\` value must be valid JSON on a single line.

---

**tabType values:** \`MAIN_EXERCISE\` | \`BFR_EXERCISE\` | \`ABS_EXERCISE\`
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
    @Body() body: any, // catches both JSON body AND form-data fields
    @Req() req: express.Request,
    @CurrentUser() user: any,
  ) {
    // ── Detect mode from Content-Type ──────────────────────────────────────
    const contentType = req.headers['content-type'] ?? '';
    const isFormData = contentType.includes('multipart/form-data');

    let dto: AddExerciseToDayDto;

    if (isFormData) {
      // ── MODE B: multipart/form-data ──────────────────────────────────────
      // `body.data` is the JSON string from the form-data `data` field
      const dataJson = body?.data;

      if (!dataJson) {
        throw new BadRequestException(
          "Missing 'data' field in form-data. Add a text field named 'data' with the exercise JSON.",
        );
      }

      if (typeof dataJson !== 'string') {
        throw new BadRequestException("'data' field must be a JSON string.");
      }

      try {
        dto = JSON.parse(dataJson);
      } catch {
        throw new BadRequestException(
          "Invalid JSON in 'data' field. Make sure it is valid JSON (no trailing commas, all quotes escaped).",
        );
      }
    } else {
      // ── MODE A: application/json ─────────────────────────────────────────
      // `body` is the fully-parsed and validated DTO (handled by NestJS pipe)
      if (!body || typeof body !== 'object' || !body.tabType) {
        throw new BadRequestException(
          "Request body is empty or missing required field 'tabType'.",
        );
      }
      dto = body as AddExerciseToDayDto;
    }

    // ── File validation (Mode B only) ───────────────────────────────────────
    const imageFile = files?.file?.[0];
    const animFile = files?.animationFile?.[0];

    if (imageFile) {
      if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(imageFile.originalname)) {
        throw new BadRequestException(
          `Invalid image type "${imageFile.originalname}". Allowed: jpg, png, webp, gif`,
        );
      }
      if (imageFile.size > 5 * 1024 * 1024) {
        throw new BadRequestException(
          `Image too large: ${(imageFile.size / 1024 / 1024).toFixed(1)}MB. Max: 5MB`,
        );
      }
    }

    if (animFile) {
      if (!/\.(gif|mp4|webm|mov)$/i.test(animFile.originalname)) {
        throw new BadRequestException(
          `Invalid animation type "${animFile.originalname}". Allowed: gif, mp4, webm, mov`,
        );
      }
      if (animFile.size > 20 * 1024 * 1024) {
        throw new BadRequestException(
          `Animation too large: ${(animFile.size / 1024 / 1024).toFixed(1)}MB. Max: 20MB`,
        );
      }
    }

    // ── Upload files in parallel (if any provided) ─────────────────────────
    //
    // uploadFileFromBuffer() auto-detects resource_type:
    //   .mp4 / .webm / .mov → resource_type: 'video'
    //   .jpg / .png / .gif  → resource_type: 'image'
    //
    if (imageFile || animFile) {
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

      // Uploaded file URL overrides any URL passed in the JSON data
      if (imageResult) dto.exerciseImageUrl = imageResult.secure_url;
      if (animResult) dto.exerciseAnimationUrl = animResult.secure_url;
    }
    // If no files → dto.exerciseImageUrl / exerciseAnimationUrl from JSON are used as-is ✅

    return this.programsService.addExerciseToDay(id, dayId, dto, user.id);
  }

  // ── Update / Delete / Reorder ─────────────────────────────────────────────
  @Patch(':id/days/:dayId/exercises/:pdeId')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: '③ Update Exercise Assignment (sets/reps/type)' })
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
  @ApiOperation({ summary: '③ Reorder Exercises (drag-and-drop order)' })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiParam({ name: 'dayId', description: 'ProgramDay ID' })
  reorderExercises(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body() dto: ReorderExercisesDto,
    @CurrentUser() user: any,
  ) {
    return this.programsService.reorderExercises(id, dayId, dto, user.id);
  }

  // ── Step 4: Review & Publish ──────────────────────────────────────────────
  @Get(':id/review')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: '④ Get Review Summary (all weeks/days/exercises)' })
  @ApiParam({ name: 'id', description: 'Program ID' })
  getReview(@Param('id') id: string) {
    return this.programsService.getReview(id);
  }

  @Patch(':id/publish')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: '④ Publish / Unpublish Program' })
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
  @ApiOperation({ summary: 'Get full program with weeks / days / exercises' })
  @ApiParam({ name: 'id', description: 'Program ID' })
  findOne(@Param('id') id: string) {
    return this.programsService.findOne(id);
  }

  @Post(':id/copy')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Deep copy program (weeks → days → exercises → sets as new DRAFT)',
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
  @ApiOperation({ summary: 'Delete program (blocked if users have it active)' })
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
    summary: 'Get Program Library (isLocked / isActiveForUser flags)',
  })
  getLibrary(@CurrentUser() user: any) {
    return this.programsService.getLibrary(user.id);
  }

  @Post('activate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Activate Program (resets to week 1 day 1)' })
  activate(@Body() dto: ActivateProgramDto, @CurrentUser() user: any) {
    return this.programsService.activateProgram(user.id, dto);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Get Active Program (full structure + current position)',
  })
  getActive(@CurrentUser() user: any) {
    return this.programsService.getUserActivePrograms(user.id);
  }

  @Delete('active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate Current Program' })
  deactivate(@CurrentUser() user: any) {
    return this.programsService.deactivateProgram(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View published program by ID' })
  @ApiParam({ name: 'id', description: 'Program ID' })
  findOne(@Param('id') id: string) {
    return this.programsService.findOne(id);
  }

  // Get('active')
  // @ApiOperation({
  //   summary: 'Get currently active program',
  //   description:
  //     'Returns the ONE program the user is doing right now.\n\n' +
  //     '**Returns null if no program is active.**\n\n' +
  //     'To see ALL past/completed programs → `GET /programs/history`',
  // })


  // getActive(@CurrentUser() user: any) {
  //   return this.programsService.getUserActivePrograms(user.id);
  // }
 
  // GET /programs/history — ALL programs (completed + paused + active)
  @Get('history')
  @ApiOperation({
    summary: 'Get all program history (completed + paused + active)',
    description:
      'Returns ALL programs the user has ever started, newest first.\n\n' +
      '`statusLabel` values:\n' +
      '- `ACTIVE` — currently running (same as GET /programs/active)\n' +
      '- `COMPLETED` — user finished all weeks\n' +
      '- `PAUSED` — started but switched to another program\n\n' +
      'Use this to show "previous programs" and let users re-activate them.',
  })
  getHistory(@CurrentUser() user: any) {
    return this.programsService.getUserProgramHistory(user.id);
  }
 
  // GET /programs/history/:historyId — single detail
  @Get('history/:historyId')
  @ApiOperation({ summary: 'Get single program history detail with full program structure' })
  @ApiParam({ name: 'historyId', description: 'UserProgram ID from /programs/history' })
  getHistoryDetail(
    @CurrentUser() user: any,
    @Param('historyId') historyId: string,
  ) {
    return this.programsService.getUserProgramHistoryDetail(user.id, historyId);
  }
}


