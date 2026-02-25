import { Controller } from '@nestjs/common';
import { SupplimentProductService } from './suppliment-product.service';

@Controller('suppliment-product')
export class SupplimentProductController {
  constructor(private readonly supplimentProductService: SupplimentProductService) {}
}
