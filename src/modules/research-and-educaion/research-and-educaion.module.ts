import { Module } from '@nestjs/common';
import { ResearchEducationService } from './research-and-educaion.service';
import { ResearchEducationController } from './research-and-educaion.controller';

@Module({
  controllers: [ResearchEducationController],
  providers: [ResearchEducationService],
  exports: [ResearchEducationService],
})
export class ResearchAndEducationModule {}