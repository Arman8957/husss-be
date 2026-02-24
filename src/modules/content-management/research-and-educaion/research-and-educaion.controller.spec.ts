import { Test, TestingModule } from '@nestjs/testing';
import { ResearchAndEducaionController } from './research-and-educaion.controller';
import { ResearchAndEducaionService } from './research-and-educaion.service';

describe('ResearchAndEducaionController', () => {
  let controller: ResearchAndEducaionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResearchAndEducaionController],
      providers: [ResearchAndEducaionService],
    }).compile();

    controller = module.get<ResearchAndEducaionController>(ResearchAndEducaionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
