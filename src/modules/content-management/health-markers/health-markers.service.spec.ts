import { Test, TestingModule } from '@nestjs/testing';
import { HealthMarkersService } from './health-markers.service';

describe('HealthMarkersService', () => {
  let service: HealthMarkersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthMarkersService],
    }).compile();

    service = module.get<HealthMarkersService>(HealthMarkersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
