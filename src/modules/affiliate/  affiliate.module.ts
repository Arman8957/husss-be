// src/modules/affiliate/affiliate.module.ts
import { Module } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import {
  SupplementCatalogController,
  CoachAffiliateController,
  ClientAffiliateController,
  AffiliateSharedController,
} from './affiliate.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    SupplementCatalogController,  // /supplements/*
    CoachAffiliateController,     // /coach/affiliates/*
    ClientAffiliateController,    // /client/affiliates/*
    AffiliateSharedController,    // /affiliates/*
  ],
  providers: [AffiliateService],
  exports:   [AffiliateService],
})
export class AffiliateModule {}