import { Module } from '@nestjs/common';
import { SupplimentProductService } from './suppliment-product.service';
import { SupplimentProductController } from './suppliment-product.controller';

@Module({
  controllers: [SupplimentProductController],
  providers: [SupplimentProductService],
})
export class SupplimentProductModule {}
