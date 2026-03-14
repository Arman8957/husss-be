import { Test, TestingModule } from '@nestjs/testing';
import { ProgrammeController } from './programme.controller';
import { ProgrammeService } from './programme.service';

describe('ProgrammeController', () => {
  let controller: ProgrammeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProgrammeController],
      providers: [ProgrammeService],
    }).compile();

    controller = module.get<ProgrammeController>(ProgrammeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
