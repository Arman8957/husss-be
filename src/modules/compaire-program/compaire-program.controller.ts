import { Controller, Get, Param } from '@nestjs/common';
import { CompaireProgramService } from './compaire-program.service';

@Controller('compaire-program')
export class CompaireProgramController {
  constructor(private readonly compaireProgramService: CompaireProgramService) { }

  @Get('programme/:curentProgrammeId/:compaireProgrammeId')
  async compairePrograme(
    @Param('curentProgrammeId') curentProgrammeId: string,
    @Param('compaireProgrammeId') compaireProgrammeId: string,
  ) {
    return this.compaireProgramService.compareProgramme(
      curentProgrammeId,
      compaireProgrammeId,
    );
  }



}
