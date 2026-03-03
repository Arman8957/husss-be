import { Test, TestingModule } from '@nestjs/testing';
import { EssentialContentService } from './essential-content.service';

describe('EssentialContentService', () => {
  let service: EssentialContentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EssentialContentService],
    }).compile();

    service = module.get<EssentialContentService>(EssentialContentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
