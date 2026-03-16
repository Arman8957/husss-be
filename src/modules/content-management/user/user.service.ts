import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserService {


    constructor(private readonly prisma: PrismaService) { }

    async getAllUser(page: number, limit: number, role?: UserRole, status?: string, search?: string) {

        const skip = (page - 1) * limit;

        const where: any = {};

        // Role Filter
        if (role) {
            where.role = role;
        }

        // Status Filter
        // if (status) {
        //     where.status = status === "active";
        // }

        // Search Filter
        if (search) {
            where.OR = [
                {
                    name: {
                        contains: search,
                        mode: "insensitive",
                    },
                },
                {
                    email: {
                        contains: search,
                        mode: "insensitive",
                    },
                },
            ];
        }

        const totalUser = await this.prisma.user.count({
            where,
        });

        const now = new Date();

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const lastMonthUserCount = await this.prisma.user.count({
            where: {
                createdAt: {
                    gte: startOfMonth,
                },
            },
        });

        const totalUserCount = await this.prisma.user.count({});
        const totalActiveUser = await this.prisma.user.count({ where: { isActive: true } });
        const premiumUser = await this.prisma.user.count({
            where: {
                isPremium: true
            }
        });


        const users = await this.prisma.user.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                createdAt: "desc",
            },
            select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                role: true,
                isActive: true,
                isPremium: true,
                lastLoginAt: true,
                createdAt: true,
                coachProfile: true
            }
        });

        return {
            meta: {
                total: totalUser,
                page,
                limit,
                totalPage: Math.ceil(totalUser / limit),
            },
            dashboardData: {
                lastMonthUserCount: lastMonthUserCount,
                totalUserCount: totalUserCount,
                totalActiveUser: totalActiveUser,
                premiumUser: premiumUser
            },
            data: users,
        };
    };



    async getMostPopularPrograms() {
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7);


        const userPrograms = await this.prisma.userProgram.findMany({
            where: {
                startedAt: { gte: startOfWeek }
            }
        });


        const programCounts: Record<
            string,
            { users: number; completed: number }
        > = {};

        for (const up of userPrograms) {
            if (!programCounts[up.programId]) {
                programCounts[up.programId] = { users: 0, completed: 0 };
            }
            programCounts[up.programId].users += 1;
            if (up.isCompleted) programCounts[up.programId].completed += 1;
        }


        const programIds = Object.keys(programCounts);
        const programs = await this.prisma.program.findMany({
            where: { id: { in: programIds }, isPublished: true },
            select: { id: true, name: true }
        });

        const result = programs
            .map(p => {
                const stats = programCounts[p.id];
                return {
                    programId: p.id,
                    name: p.name,
                    users: stats.users,
                    completionRate: Math.round((stats.completed / stats.users) * 100)
                };
            })
            .sort((a, b) => b.users - a.users)
            .slice(0, 4);

        return result;
    }



    async userActivityLog() {
        const userActivityLog = await this.prisma.userActivityLog.findMany({
            take: 15,
            orderBy: {
                createdAt: "desc"
            }
        });

        const mostRecentActiveUser = await this.prisma.user.findMany({
            where: {
                isActive: true,
                emailVerified: true
            },
            orderBy: {
                lastLoginAt: "desc"
            },
            take: 20
        });

        const mostPopulerProgramme = await this.getMostPopularPrograms();

        return {
            meta: {
                workoutCompliteToday: 186,
                activeSession: 519,
                avgSessionTime: 41
            },
            userActivityLog,
            mostRecentActiveUser,
            mostPopulerProgramme: mostPopulerProgramme
        }

    }

}


// model UserActivityLog {
//   id        String           @id @default(cuid())
//   userId    String
//   type      UserActivityType
//   meta      Json? // e.g. { programName: "Monster Mass Builder" }
//   createdAt DateTime         @default(now())

//   @@index([userId])
//   @@index([type])
//   @@index([createdAt])
//   @@map("user_activity_logs")
// }
