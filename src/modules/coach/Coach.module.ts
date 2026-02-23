// src/coach/coach.module.ts
import { Module } from '@nestjs/common';
import { CoachService } from './coach.service';
import {
  CoachController,
  ClientCoachController,
  PublicCoachController,
} from './coach.controller';
import { PrismaService } from 'src/prisma/prisma.service';


@Module({
  controllers: [CoachController, ClientCoachController, PublicCoachController],
  providers: [CoachService, PrismaService],
  exports: [CoachService],
})
export class CoachModule {}