import { Module } from '@nestjs/common';
import { ProgrammeService } from './programme.service';
import { ProgrammeController } from './programme.controller';

@Module({
  controllers: [ProgrammeController],
  providers: [ProgrammeService],
})
export class ProgrammeModule {}
