import { Test, TestingModule } from '@nestjs/testing';
import { SupplimentController } from './suppliment.controller';
import { SupplimentService } from './suppliment.service';

describe('SupplimentController', () => {
  let controller: SupplimentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupplimentController],
      providers: [SupplimentService],
    }).compile();

    controller = module.get<SupplimentController>(SupplimentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
