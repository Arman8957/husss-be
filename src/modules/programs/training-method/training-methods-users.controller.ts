//   @ApiTags('👤 User — Training Methods')
// @ApiBearerAuth('JWT-auth')
// @UseGuards(JwtAuthGuard)
// @Controller('training-methods')
// export class UserTrainingMethodsController {
//   constructor(private readonly service: TrainingMethodsService) {}
 
//   /**
//    * GET /api/v1/training-methods
//    * Training Methods Library screen — returns all active methods.
//    * Response: { total, methods: [{ id, name, type, setsInfo, description, ... }] }
//    *
//    * Used by: client + coach — the library screen shown in the app.
//    */
//   @Get()
//   @ApiOperation({
//     summary: 'Training Methods Library (all active methods)',
//     description:
//       'Returns all active training methods for the library screen.\n\n' +
//       'Each item includes:\n' +
//       '- `name` — display name (e.g. "5 × 5")\n' +
//       '- `setsInfo` — subtitle shown under name (e.g. "5 sets of 5 heavy reps.")\n' +
//       '- `description` — full detail shown on info tap\n' +
//       '- `repRange`, `restPeriod`, `intensity`, `notes`',
//   })
//   getLibrary() {
//     return this.service.getLibrary();
//   }
 
//   /**
//    * GET /api/v1/training-methods/:id
//    * Single training method detail — shown when user taps ⓘ icon.
//    */
//   @Get(':id')
//   @ApiOperation({ summary: 'Get single training method detail' })
//   @ApiParam({ name: 'id', description: 'Training method ID' })
//   getOne(@Param('id') id: string) {
//     return this.service.getLibraryItem(id);
//   }