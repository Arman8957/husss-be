import { Test, TestingModule } from '@nestjs/testing';
import { SupplimentProductService } from './suppliment-product.service';

describe('SupplimentProductService', () => {
  let service: SupplimentProductService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupplimentProductService],
    }).compile();

    service = module.get<SupplimentProductService>(SupplimentProductService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
