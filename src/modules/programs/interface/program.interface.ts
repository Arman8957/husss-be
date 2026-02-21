// src/programs/interfaces/program.interface.ts

import {
  ProgramType, ProgramDifficulty, DaySplitType, WorkoutDayType,
  TrainingMethodType, SetType, ExerciseTabType, AbsWorkoutType,
  MediaType, ExerciseCategory, MuscleGroup, EquipmentType,
} from '@prisma/client';

// ── Program ───────────────────────────────────────────────────────────────────

export interface IProgram {
  id: string;
  name: string;
  description: string | null;
  type: ProgramType;
  difficulty: ProgramDifficulty;
  durationWeeks: number;
  daysPerWeek: number;
  daySplitType: DaySplitType;
  isPremium: boolean;
  isActive: boolean;
  isPublished: boolean;
  thumbnailUrl: string | null;
  sortOrder: number;
  features: string[];
  tags: string[];
  hasBFR: boolean;
  hasAbsWorkout: boolean;
  hasActivation: boolean;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProgramWithWeeks extends IProgram {
  weeks: IProgramWeek[];
  analytics?: IProgramAnalytics;
}

export interface IProgramWeek {
  id: string;
  programId: string;
  weekNumber: number;
  isPremium: boolean;
  notes: string | null;
  days: IProgramDay[];
  trainingMethods: IProgramWeekTrainingMethod[];
}

export interface IProgramWeekTrainingMethod {
  id: string;
  programWeekId: string;
  trainingMethodId: string;
  dayType: WorkoutDayType;
  trainingMethod: ITrainingMethod;
}

export interface IProgramDay {
  id: string;
  programWeekId: string;
  dayNumber: number;
  dayType: WorkoutDayType;
  name: string | null;
  isRestDay: boolean;
  notes: string | null;
  exercises: IProgramDayExercise[];
}

export interface IProgramDayExercise {
  id: string;
  programDayId: string;
  exerciseId: string;
  sortOrder: number;
  reps: string;
  restSeconds: number | null;
  setType: SetType;
  isOptional: boolean;
  notes: string | null;
  isBFR: boolean;
  isAbs: boolean;
  isAccessory: boolean;
  accessoryNote: string | null;
  exercise: IExercise;
  sets: IProgramDayExerciseSet[];
}

export interface IProgramDayExerciseSet {
  id: string;
  programDayExerciseId: string;
  setNumber: number;
  reps: string;
  restSeconds: number;
  notes: string | null;
}

export interface IProgramAnalytics {
  id: string;
  programId: string;
  totalEnrollments: number;
  activeEnrollments: number;
  completedCount: number;
  completionRate: number;
  avgWeeksCompleted: number;
  updatedAt: Date;
}

// ── Exercise ──────────────────────────────────────────────────────────────────

export interface IExercise {
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

// ── Training Method ───────────────────────────────────────────────────────────

export interface ITrainingMethod {
  id: string;
  name: string;
  type: TrainingMethodType;
  description: string;
  setsInfo: string | null;
  repRange: string | null;
  restPeriod: string | null;
  intensity: string | null;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── User Active Program ───────────────────────────────────────────────────────

export interface IUserActiveProgram {
  id: string;
  userId: string;
  programId: string;
  startedAt: Date;
  currentWeek: number;
  currentDay: number;
  absWorkoutType: AbsWorkoutType;
  bfrEnabled: boolean;
  program?: IProgramWithWeeks;
}

// ── Review Shape (Step 4 UI) ──────────────────────────────────────────────────

export interface IProgramReviewShape {
  id: string;
  name: string;
  description: string | null;
  duration: string;
  weeks: IReviewWeek[];
}

export interface IReviewWeek {
  weekNumber: number;
  days: IReviewDay[];
}

export interface IReviewDay {
  dayNumber: number;
  name: string | null;
  dayType: WorkoutDayType;
  method: string | null;
  notes: string | null;
  mainExercises: IReviewExercise[];
  bfrFinisher: string | null;
  absNote: string | null;
}

export interface IReviewExercise {
  id: string;
  exerciseName: string;
  sets: number;
  reps: string;
  rest: string;
  setDetails: IProgramDayExerciseSet[];
  media: IExerciseMedia[];
}

// ── Library ───────────────────────────────────────────────────────────────────

export interface IProgramLibraryItem extends IProgram {
  isLocked: boolean;
  isActiveForUser: boolean;
  analytics: Partial<IProgramAnalytics> | null;
}