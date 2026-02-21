// src/exercises/interfaces/exercise.interface.ts

import { ExerciseCategory, MuscleGroup, EquipmentType, MediaType } from '@prisma/client';

export interface IExerciseWithMedia {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  category: ExerciseCategory;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: EquipmentType;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  gifUrl: string | null;
  isActive: boolean;
  isPublished: boolean;
  createdByAdminId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  media: IExerciseMedia[];
}

export interface IExerciseMedia {
  id: string;
  exerciseId: string;
  type: MediaType;
  url: string;
  label: string | null;
  sortOrder: number;
  createdAt: Date;
}

export interface IExerciseListResponse {
  data: IExerciseWithMedia[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}