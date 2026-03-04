import { PartialType } from '@nestjs/mapped-types';
import { CreateSupplementProductDto } from './create-supplement-product.dto';

export class UpdateSupplementProductDto extends PartialType(CreateSupplementProductDto) {}