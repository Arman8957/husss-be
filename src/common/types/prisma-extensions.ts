import { Prisma } from '@prisma/client';

// Use Prisma's User type (it should include appleId and firebaseUid after generation)
export type UserWithOAuth = Prisma.UserGetPayload<{
  include: {
    sessions: false;
    tasks: false;
    restrictions: false;
    auditLogs: false;
  }
}>;