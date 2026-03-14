import { Module } from '@nestjs/common';
import { TrainingMethodsService }  from './training-methods.service';
import {
  AdminTrainingMethodsController,
  UserTrainingMethodsController,
} from './training-methods.controller';
import { PrismaModule } from 'src/prisma/prisma.module'; 
 
@Module({
  imports:     [PrismaModule],   
  controllers: [
    AdminTrainingMethodsController,      // /api/v1/admin/training-methods
    UserTrainingMethodsController,       // /api/v1/training-methods
  ],
  providers:   [TrainingMethodsService],
  exports:     [TrainingMethodsService],
})
export class TrainingMethodsModule {}
