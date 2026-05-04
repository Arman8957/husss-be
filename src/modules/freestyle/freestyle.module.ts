import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FreestyleController } from './freestyle.controller';
import { FreestyleService } from './freestyle.service';
// import { FreestyleController } from './freestyle.controller';
// import { FreestyleService }    from './freestyle.service';
// import { PrismaModule }        from 'src/prisma/prisma.module';
 
@Module({
  imports:     [PrismaModule],
  controllers: [FreestyleController],
  providers:   [FreestyleService],
  exports:     [FreestyleService],
})
export class FreestyleModule {}