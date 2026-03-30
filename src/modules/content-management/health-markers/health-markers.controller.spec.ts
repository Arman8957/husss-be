import { Test, TestingModule } from '@nestjs/testing';
import { HealthMarkersController } from './health-markers.controller';
import { HealthMarkersService } from './health-markers.service';

describe('HealthMarkersController', () => {
  let controller: HealthMarkersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthMarkersController],
      providers: [HealthMarkersService],
    }).compile();

    controller = module.get<HealthMarkersController>(HealthMarkersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
