import { Test, TestingModule } from '@nestjs/testing';
import { BrfController } from './brf.controller';
import { BrfService } from './brf.service';

describe('BrfController', () => {
  let controller: BrfController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrfController],
      providers: [BrfService],
    }).compile();

    controller = module.get<BrfController>(BrfController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
