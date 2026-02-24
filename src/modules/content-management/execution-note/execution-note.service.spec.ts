import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionNoteService } from './execution-note.service';

describe('ExecutionNoteService', () => {
  let service: ExecutionNoteService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExecutionNoteService],
    }).compile();

    service = module.get<ExecutionNoteService>(ExecutionNoteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
