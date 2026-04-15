// src/coach/coach.module.ts
import { Module } from '@nestjs/common';
import { CoachService } from './coach.service';
import {
  CoachController,
  ClientCoachController,
  PublicCoachController,
} from './coach.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { InviteRedirectController } from './invite.controller';


@Module({
  controllers: [CoachController, ClientCoachController, PublicCoachController, InviteRedirectController],
  providers: [CoachService, PrismaService],
  exports: [CoachService],
})
export class CoachModule {}