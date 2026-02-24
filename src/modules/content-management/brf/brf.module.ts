import { Module } from '@nestjs/common';
import { BrfService } from './brf.service';
import { BrfController } from './brf.controller';

@Module({
  controllers: [BrfController],
  providers: [BrfService],
})
export class BrfModule {}
