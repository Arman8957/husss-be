import { Test, TestingModule } from '@nestjs/testing';
import { SupplimentService } from './suppliment.service';

describe('SupplimentService', () => {
  let service: SupplimentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupplimentService],
    }).compile();

    service = module.get<SupplimentService>(SupplimentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
