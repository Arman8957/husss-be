import { Module } from '@nestjs/common';
import { SupplimentService } from './suppliment.service';
import { SupplimentController } from './suppliment.controller';

@Module({
  controllers: [SupplimentController],
  providers: [SupplimentService],
})
export class SupplimentModule {}
