import { Module }          from '@nestjs/common';
import { PrismaModule }    from 'src/prisma/prisma.module';
import { TrainingMethodsController } from './training-methods.controller';
import { TrainingMethodsService } from './training-methods.service';
 
@Module({
  imports:     [PrismaModule],
  controllers: [TrainingMethodsController],
  providers:   [TrainingMethodsService],
  exports:     [TrainingMethodsService],
})
export class TrainingMethodsModule {}