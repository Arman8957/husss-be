export interface IFreestyleState {
  userId: string;
  programLengthWeeks: number;
  currentWeek: number;
  currentSessionNumber: number; // total sessions done in this cycle
  bfrEnabled: boolean;
  absWorkoutType: 'TWO_DAY' | 'THREE_DAY';
  startedAt: Date;
  lastSessionAt: Date | null;
  lastDayType: string | null;
}
 
export interface IMethodCycleProgress {
  dayType: 'PUSH' | 'PULL' | 'LEGS';
  totalMethods: number;
  usedMethods: string[];    // method types used so far in this cycle
  remainingMethods: string[]; // not yet used in current cycle
  cycleComplete: boolean;
  progress: string;         // "3/13" format shown in UI
}
 
export interface IFreestyleSessionInfo {
  sessionId: string;
  dayType: string;
  trainingMethod: string;
  trainingMethodName: string;
  exercises: IFreestyleExercise[];
  methodDetails: {
    name: string;
    setsInfo: string | null;
    repRange: string | null;
    restPeriod: string | null;
    intensity: string | null;
    notes: string | null;
  };
}
 
export interface IFreestyleExercise {
  id: string;
  name: string;
  category: string;
  primaryMuscle: string;
  equipment: string;
  media: any[];
  prescribedSets: number;
  prescribedReps: string;
  restSeconds: number;
}
 
export interface ILastSession {
  date: Date;
  dayType: string;
  trainingMethodName: string;
}
 
export interface IFreestyleDashboard {
  isActive: boolean;
  setup: {
    programLengthWeeks: number;
    currentWeek: number;
    bfrEnabled: boolean;
    absWorkoutType: string;
    startedAt: Date | null;
  } | null;
  lastSession: ILastSession | null;
  methodCycleProgress: {
    PUSH: IMethodCycleProgress;
    PULL: IMethodCycleProgress;
    LEGS: IMethodCycleProgress;
  };
  availableDayTypes: Array<'PUSH' | 'PULL' | 'LEGS'>; // blocked if last session was same type
  recentSessions: IRecentSession[];
  trainingMethods: ITrainingMethodOption[];
}
 
export interface IRecentSession {
  sessionId: string;
  date: Date;
  dayOfWeek: string;   // "Fri"
  dayNumber: number;   // 9
  shortType: string;   // "Pl" (Pull), "Pu" (Push), "Le" (Legs)
  dayType: string;
  trainingMethodName: string;
  exerciseCount: number;
  totalVolume: number | null;
  status: string;
}
 
export interface ITrainingMethodOption {
  id: string;
  type: string;
  name: string;
  label: string | null;
  setsInfo: string | null;
  repRange: string | null;
  restPeriod: string | null;
  intensity: string | null;
  notes: string | null;
  isUsedInCurrentCycle: boolean; // shown with checkmark in UI
}
 