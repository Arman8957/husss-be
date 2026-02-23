import { Module } from '@nestjs/common';
import { ExecutionNoteService } from './execution-note.service';
import { ExecutionNoteController } from './execution-note.controller';

@Module({
  controllers: [ExecutionNoteController],
  providers: [ExecutionNoteService],
})
export class ExecutionNoteModule {}
