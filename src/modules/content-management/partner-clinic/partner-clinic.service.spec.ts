import { Test, TestingModule } from '@nestjs/testing';
import { PartnerClinicService } from './partner-clinic.service';

describe('PartnerClinicService', () => {
  let service: PartnerClinicService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PartnerClinicService],
    }).compile();

    service = module.get<PartnerClinicService>(PartnerClinicService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
