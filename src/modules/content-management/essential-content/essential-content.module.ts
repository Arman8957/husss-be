import { Module } from '@nestjs/common';
import { EssentialContentService } from './essential-content.service';
import { EssentialContentController } from './essential-content.controller';

@Module({
  controllers: [EssentialContentController],
  providers: [EssentialContentService],
})
export class EssentialContentModule {}
