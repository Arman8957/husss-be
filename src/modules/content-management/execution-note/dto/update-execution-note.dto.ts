import { PartialType } from '@nestjs/swagger';
import { CreateExecutionNoteDto } from './create-execution-note.dto';

export class UpdateExecutionNoteDto extends PartialType(CreateExecutionNoteDto) { }