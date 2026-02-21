// src/programs.module.ts

import { Module } from '@nestjs/common';


// Exercises
import { ExercisesService } from './exercises/exercises.service';
import { AdminExercisesController, UserExercisesController } from './exercises/exercises.controller';
import { AdminProgramsController, UserProgramsController } from './programs.controller';
import { AdminTrainingMethodsController, UserTrainingMethodsController } from './training-method/training-methods.controller';
import { WorkoutController } from './workout/workout.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProgramsService } from './programs.service';
import { TrainingMethodsService } from './training-method/training-methods.service';
import { WorkoutService } from './workout/workout.service';

// Training Methods


// Workout


@Module({
  controllers: [
    AdminProgramsController,
    UserProgramsController,
    AdminExercisesController,
    UserExercisesController,
    AdminTrainingMethodsController,
    UserTrainingMethodsController,
    WorkoutController,
  ],
  providers: [
    PrismaService,
    ProgramsService,
    ExercisesService,
    TrainingMethodsService,
    WorkoutService,
  ],
  exports: [
    ProgramsService,
    ExercisesService,
    TrainingMethodsService,
    WorkoutService,
    PrismaService,
  ],
})
export class ProgramsModule {}