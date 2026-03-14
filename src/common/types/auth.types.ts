export type ActiveProfile =
  | 'EXERCISE_USER'
  | 'TRAINEE'
  | 'COACH'
  | 'MODERATOR'
  | 'ADMIN'
  | 'SUPER_ADMIN';
 
export interface UserContext {
  isTrainee:       boolean;
  isExerciseUser:  boolean;
  isCoach:         boolean;
  isAdmin:         boolean;
  isSuperAdmin:    boolean;
  clientProfileId: string | null;
  coachName:       string | null;
  traineeStatus:   string | null;
  coachProfileId:  string | null;
  activeProfiles:  ActiveProfile[];
}
 
export interface SessionResponse {
  accessToken:  string;
  refreshToken: string;
  sessionId:    string;
  user:         SafeUser;
  context:      UserContext;
}
 
export interface SafeUser {
  id:          string;
  email:       string;
  name:        string | null;
  avatar:      string | null;
  role:        string;
  permissions: string[];
  isPremium:   boolean;
}
 