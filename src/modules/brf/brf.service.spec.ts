import { Test, TestingModule } from '@nestjs/testing';
import { BrfService } from './brf.service';

describe('BrfService', () => {
  let service: BrfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BrfService],
    }).compile();

    service = module.get<BrfService>(BrfService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
