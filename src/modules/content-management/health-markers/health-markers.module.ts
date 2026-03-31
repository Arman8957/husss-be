import { Module } from '@nestjs/common';
import { HealthMarkersService } from './health-markers.service';
import { HealthMarkersController } from './health-markers.controller';

@Module({
  controllers: [HealthMarkersController],
  providers: [HealthMarkersService],
})
export class HealthMarkersModule {}
