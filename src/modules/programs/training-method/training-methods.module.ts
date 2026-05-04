import { Module }          from '@nestjs/common';
import { PrismaModule }    from 'src/prisma/prisma.module';
import { TrainingMethodsController } from './training-methods.controller';
import { TrainingMethodsService } from './training-methods.service';
import { TrainingMethodsControllerForUser } from './training-methods-users.controller';
 
@Module({
  imports:     [PrismaModule],
  controllers: [TrainingMethodsController, TrainingMethodsControllerForUser],
  providers:   [TrainingMethodsService],
  exports:     [TrainingMethodsService],
})
export class TrainingMethodsModule {}