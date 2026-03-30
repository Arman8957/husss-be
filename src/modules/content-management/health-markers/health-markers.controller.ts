import { Controller } from '@nestjs/common';
import { HealthMarkersService } from './health-markers.service';

@Controller('health-markers')
export class HealthMarkersController {
  constructor(private readonly healthMarkersService: HealthMarkersService) {}
}
