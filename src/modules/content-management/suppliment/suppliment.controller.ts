import { Controller } from '@nestjs/common';
import { SupplimentService } from './suppliment.service';

@Controller('suppliment')
export class SupplimentController {
  constructor(private readonly supplimentService: SupplimentService) {}
}
