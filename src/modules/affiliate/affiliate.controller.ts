// src/modules/affiliate/affiliate.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import {
  GetSupplementsQueryDto,
  LinkAffiliateProductDto,
  RecordAffiliatePurchaseDto,
  GetCatalogQueryDto,
} from './dto/affiliate.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard   } from 'src/common/guards/roles.guard';
import { Roles        } from 'src/common/decorators/roles.decorator';
import { CurrentUser  } from 'src/common/decorators/current-user.decorator';
import { UserRole     } from '@prisma/client';

// ═════════════════════════════════════════════════════════════════════════════
// 1. PUBLIC — Supplement Product Catalog
//    Prefix: /api/v1/supplements
//    Auth: NONE — accessible to all (browse before even signing up)
// ═════════════════════════════════════════════════════════════════════════════
@Controller('supplements')
export class SupplementCatalogController {
  constructor(private readonly affiliateService: AffiliateService) {}

  /**
   * GET /api/v1/supplements
   * Browse admin-managed supplement product catalog.
   *
   * Query params:
   *   category?    FOUNDATION | PERFORMANCE | RECOVERY | OPTIONAL
   *   inStockOnly? true | false
   *   page?        default 1
   *   limit?       default 20, max 100
   *
   * Used by: "Shop" tab visible to both coaches and clients.
   */
  // @Get()
  // getProducts(
  //   @Query(new ValidationPipe({ transform: true }))
  //   query: GetSupplementsQueryDto,
  // ) {
  //   return this.affiliateService.getSupplementProducts(query);
  // }

  /**
   * GET /api/v1/supplements/grouped
   * Products grouped by category.
   * Returns: { FOUNDATION: [...], PERFORMANCE: [...], RECOVERY: [...], OPTIONAL: [...] }
   *
   * Used by: Category-tab layout in the Shop screen.
   */
  @Get('grouped')
  getGrouped() {
    return this.affiliateService.getSupplementProductsGrouped();
  }

  /**
   * GET /api/v1/supplements/:productId
   * Single product detail with purchasePageUrl for "Buy Now" button.
   */
  @Get(':productId')
  getProductById(@Param('productId') productId: string) {
    return this.affiliateService.getSupplementProductById(productId);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. COACH — Affiliate Product Management
//    Prefix: /api/v1/coach/affiliates
//    Auth: JWT + Role COACH
// ═════════════════════════════════════════════════════════════════════════════
@Controller('coach/affiliates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COACH)
export class CoachAffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  /**
   * GET /api/v1/coach/affiliates/catalog
   * Browse full admin AffiliateProduct catalog.
   * Coach picks products from here to recommend to their clients.
   *
   * Query: page?, limit?
   */
  // @Get('catalog')
  // getCatalog(
  //   @Query(new ValidationPipe({ transform: true }))
  //   query: GetCatalogQueryDto,
  // ) {
  //   return this.affiliateService.getAdminAffiliateCatalog(query);
  // }

  /**
   * GET /api/v1/coach/affiliates/products
   * Coach's currently active recommended products.
   * These are what clients see in their "Recommended" tab.
   */
  @Get('products')
  getMyLinkedProducts(@CurrentUser() user: any) {
    return this.affiliateService.getCoachLinkedProducts(user.id);
  }

  /**
   * POST /api/v1/coach/affiliates/products/:affiliateProductId
   * Link an affiliate product to this coach's recommendations.
   * Idempotent — calling again updates customLink / commissionRate.
   *
   * Body (optional):
   *   customLink?     "https://store.com/creatine?ref=mycode"
   *   commissionRate? 5.0  (percentage)
   */
  @Post('products/:affiliateProductId')
  @HttpCode(HttpStatus.CREATED)
  linkProduct(
    @CurrentUser() user: any,
    @Param('affiliateProductId') affiliateProductId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: LinkAffiliateProductDto,
  ) {
    return this.affiliateService.linkAffiliateProduct(user.id, affiliateProductId, dto);
  }

  /**
   * DELETE /api/v1/coach/affiliates/products/:affiliateProductId
   * Remove a product from coach's recommendations.
   * Soft-delete — sets isActive=false.
   */
  @Delete('products/:affiliateProductId')
  @HttpCode(HttpStatus.OK)
  unlinkProduct(
    @CurrentUser() user: any,
    @Param('affiliateProductId') affiliateProductId: string,
  ) {
    return this.affiliateService.unlinkAffiliateProduct(user.id, affiliateProductId);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. CLIENT — View Coach Recommendations
//    Prefix: /api/v1/client/affiliates
//    Auth: JWT (any authenticated user with ClientProfile)
// ═════════════════════════════════════════════════════════════════════════════
@Controller('client/affiliates')
@UseGuards(JwtAuthGuard)
export class ClientAffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  /**
   * GET /api/v1/client/affiliates/recommended
   * Products recommended by the client's coach.
   *
   * Each item includes:
   *   purchaseUrl — coach's custom link if set, otherwise admin's default link
   *   hasCoachLink — true if coach provided their own affiliate URL
   *
   * Client taps "Buy Now" → opens purchaseUrl in browser/webview.
   */
  @Get('recommended')
  getRecommended(@CurrentUser() user: any) {
    return this.affiliateService.getCoachRecommendedProducts(user.id);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. SHARED — Purchase Recording
//    Prefix: /api/v1/affiliates
//    Auth: JWT (coach OR client — any authenticated user)
// ═════════════════════════════════════════════════════════════════════════════
@Controller('affiliates')
@UseGuards(JwtAuthGuard)
export class AffiliateSharedController {
  constructor(private readonly affiliateService: AffiliateService) {}

  /**
   * POST /api/v1/affiliates/purchases
   * Record a completed affiliate purchase.
   * Call this AFTER the user completes checkout on the external affiliate site.
   *
   * Body:
   *   affiliateProductId  required
   *   amount              required  (what the user paid)
   *   referringCoachId?   optional  (for commission tracking)
   *   currency?           default USD
   *   orderId?            external order reference
   *
   * Used by: both coaches and clients.
   */
  @Post('purchases')
  @HttpCode(HttpStatus.CREATED)
  recordPurchase(
    @CurrentUser() user: any,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: RecordAffiliatePurchaseDto,
  ) {
    return this.affiliateService.recordAffiliatePurchase(user.id, dto);
  }

  /**
   * GET /api/v1/affiliates/purchases/me
   * My affiliate purchase history (coach or client).
   */
  @Get('purchases/me')
  getMyPurchases(@CurrentUser() user: any) {
    return this.affiliateService.getMyPurchaseHistory(user.id);
  }
}