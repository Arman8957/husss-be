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
            },
        });

        return {
            meta: {
                total: totalUser,
                page,
                limit,
                totalPage: Math.ceil(totalUser / limit),
            },
            data: users,
        };
    }


}
