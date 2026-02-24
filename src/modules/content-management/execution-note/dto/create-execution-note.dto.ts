import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class CreateExecutionNoteDto {

    @ApiProperty({
        example: 'Workout Duration Rule',
        description: 'Title of the execution note'
    })
    @IsString()
    title!: string;

    @ApiProperty({
        example: ['Keep rest between sets 30 seconds', 'Maintain proper breathing'],
        description: 'Bullet point notes',
        type: [String]
    })
    @IsArray()
    @IsString({ each: true })
    notes!: string[];

    @ApiPropertyOptional({
        example: 'Follow all instructions carefully for best results.',
        description: 'Optional final summary message'
    })
    @IsOptional()
    @IsString()
    finalMessage?: string;

    @ApiPropertyOptional({
        example: 1,
        description: 'Display order position'
    })
    @IsOptional()
    @IsInt()
    position?: number;

    @ApiPropertyOptional({
        example: true,
        description: 'Whether the note is active'
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}