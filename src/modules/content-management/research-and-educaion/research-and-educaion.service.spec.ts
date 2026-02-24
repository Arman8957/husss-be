import { Test, TestingModule } from '@nestjs/testing';
import { ResearchAndEducaionService } from './research-and-educaion.service';

describe('ResearchAndEducaionService', () => {
  let service: ResearchAndEducaionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResearchAndEducaionService],
    }).compile();

    service = module.get<ResearchAndEducaionService>(ResearchAndEducaionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
