import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionNoteController } from './execution-note.controller';
import { ExecutionNoteService } from './execution-note.service';

describe('ExecutionNoteController', () => {
  let controller: ExecutionNoteController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionNoteController],
      providers: [ExecutionNoteService],
    }).compile();

    controller = module.get<ExecutionNoteController>(ExecutionNoteController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
