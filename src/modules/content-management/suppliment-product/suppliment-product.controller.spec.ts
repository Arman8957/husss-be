import { Test, TestingModule } from '@nestjs/testing';
import { SupplimentProductController } from './suppliment-product.controller';
import { SupplimentProductService } from './suppliment-product.service';

describe('SupplimentProductController', () => {
  let controller: SupplimentProductController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupplimentProductController],
      providers: [SupplimentProductService],
    }).compile();

    controller = module.get<SupplimentProductController>(SupplimentProductController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
