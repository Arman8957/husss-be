import { Module } from '@nestjs/common';
import { CompaireProgramService } from './compaire-program.service';
import { CompaireProgramController } from './compaire-program.controller';

@Module({
  controllers: [CompaireProgramController],
  providers: [CompaireProgramService],
})
export class CompaireProgramModule {}
