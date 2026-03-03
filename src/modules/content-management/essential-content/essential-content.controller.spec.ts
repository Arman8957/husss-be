import { Test, TestingModule } from '@nestjs/testing';
import { EssentialContentController } from './essential-content.controller';
import { EssentialContentService } from './essential-content.service';

describe('EssentialContentController', () => {
  let controller: EssentialContentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EssentialContentController],
      providers: [EssentialContentService],
    }).compile();

    controller = module.get<EssentialContentController>(EssentialContentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
