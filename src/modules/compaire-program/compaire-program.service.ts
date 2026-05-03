import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CompaireProgramService {

    constructor(readonly prisma: PrismaService) { }

    async findSingleProgramme(programmeId: string) {
        const findProgramme = await this.prisma.program.findUnique({ where: { id: programmeId } })
    }

    async compareProgramme(
        currentProgrammeId: string,
        compareProgrammeId: string,
    ) {
        // ==============================
        // 1. Fetch Programmes + Weeks + Methods
        // ==============================
        const [programmeOne, programmeTwo] = await Promise.all([
            this.prisma.program.findUnique({
                where: { id: currentProgrammeId },
                include: {
                    weeks: {
                        orderBy: { weekNumber: 'asc' },
                        include: {
                            trainingMethods: {
                                include: {
                                    trainingMethod: true,
                                },
                            },
                        },
                    },
                },
            }),

            this.prisma.program.findUnique({
                where: { id: compareProgrammeId },
                include: {
                    weeks: {
                        orderBy: { weekNumber: 'asc' },
                        include: {
                            trainingMethods: {
                                include: {
                                    trainingMethod: true,
                                },
                            },
                        },
                    },
                },
            }),
        ]);

        if (!programmeOne || !programmeTwo) {
            throw new NotFoundException('Programme not found');
        }

        // ==============================
        // 2. Program Overview
        // ==============================
        const programOverview = {
            duration: {
                programmeOne: `${programmeOne.durationWeeks} Week`,
                programmeTwo: `${programmeTwo.durationWeeks} Week`,
            },

            daysPerWeek: {
                programmeOne: `${programmeOne.daysPerWeek}/${programmeOne.durationWeeks}`,
                programmeTwo: `${programmeTwo.daysPerWeek}/${programmeTwo.durationWeeks}`,
            },

            workingDays: {
                programmeOne: programmeOne.durationWeeks * programmeOne.daysPerWeek,
                programmeTwo: programmeTwo.durationWeeks * programmeTwo.daysPerWeek,
            },

            activationDays: {
                programmeOne: programmeOne.durationWeeks * 6,
                programmeTwo: programmeTwo.durationWeeks * 4,
            },

            totalExercises: {
                programmeOne: programmeOne.weeks.length * 3,
                programmeTwo: programmeTwo.weeks.length * 4,
            },
        };

        // ==============================
        // 3. Training Methods
        // ==============================
        const formatTrainingMethods = (programme: any) => {
            return programme.weeks.map((week: any) => ({
                week: week.weekNumber,
                methods: week.trainingMethods.map((item: any) => ({
                    dayType: item.dayType,
                    methodName: item.trainingMethod.name,
                })),
            }));
        };

        // ==============================
        // 4. Weekly Volume Comparison
        // ==============================
        const weeklyVolumeComparison = {
            chest: {
                programmeOne: 11,
                programmeTwo: 8,
            },
            back: {
                programmeOne: 9,
                programmeTwo: 10,
            },
        };

        // ==============================
        // 5. Exercise By Day Type
        // ==============================
        const exerciseByDayType = {
            push: {
                programmeOne: {
                    name: programmeOne.name,
                    totalExercise: 12,
                },
                programmeTwo: {
                    name: programmeTwo.name,
                    totalExercise: 8,
                },
            },

            pull: {
                programmeOne: {
                    name: programmeOne.name,
                    totalExercise: 10,
                },
                programmeTwo: {
                    name: programmeTwo.name,
                    totalExercise: 8,
                },
            },

            leg: {
                programmeOne: {
                    name: programmeOne.name,
                    totalExercise: 12,
                },
                programmeTwo: {
                    name: programmeTwo.name,
                    totalExercise: 8,
                },
            },
        };

        // ==============================
        // Final Response
        // ==============================
        return {
            programmeOne: {
                id: programmeOne.id,
                name: programmeOne.name,
                thumbnail: programmeOne.thumbnailUrl,
            },

            programmeTwo: {
                id: programmeTwo.id,
                name: programmeTwo.name,
                thumbnail: programmeTwo.thumbnailUrl,
            },

            programOverview,
            trainingMethods: {
                programmeOne: formatTrainingMethods(programmeOne),
                programmeTwo: formatTrainingMethods(programmeTwo),
            },
            weeklyVolumeComparison,
            exerciseByDayType,
        };
    }

}
