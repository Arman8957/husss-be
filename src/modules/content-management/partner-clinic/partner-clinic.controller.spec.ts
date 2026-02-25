import { Test, TestingModule } from '@nestjs/testing';
import { PartnerClinicController } from './partner-clinic.controller';
import { PartnerClinicService } from './partner-clinic.service';

describe('PartnerClinicController', () => {
  let controller: PartnerClinicController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PartnerClinicController],
      providers: [PartnerClinicService],
    }).compile();

    controller = module.get<PartnerClinicController>(PartnerClinicController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
