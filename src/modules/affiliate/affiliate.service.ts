// src/modules/affiliate/affiliate.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  GetSupplementsQueryDto,
  LinkAffiliateProductDto,
  RecordAffiliatePurchaseDto,
  GetCatalogQueryDto,
} from './dto/affiliate.dto';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface PaginatedResult<T> {
  data: T[];
  meta: {
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
    hasNext:    boolean;
    hasPrev:    boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — SUPPLEMENT PRODUCT CATALOG
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * List all active supplement products from the admin-managed catalog.
   * Accessible to everyone — no auth required.
   * Supports pagination, category filter, and in-stock filter.
   */
  async getSupplementProducts(
    query: GetSupplementsQueryDto,
  ): Promise<PaginatedResult<any>> {
    const where: any = { isActive: true };
    if (query.category)    where.category = query.category;
    if (query.inStockOnly) where.inStock   = true;

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;
    const skip  = (page - 1) * limit;

    try {
      const [products, total] = await Promise.all([
        this.prisma.supplementProduct.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          skip,
          take: limit,
          select: {
            id:             true,
            name:           true,
            category:       true,
            price:          true,
            currency:       true,
            vendorName:     true,
            purchasePageUrl: true,
            benefits:       true,
            imageUrl:       true,
            inStock:        true,
            sortOrder:      true,
            createdAt:      true,
          },
        }),
        this.prisma.supplementProduct.count({ where }),
      ]);

      return {
        data: products,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext:    page < Math.ceil(total / limit),
          hasPrev:    page > 1,
        },
      };
    } catch (error) {
      this.logger.error('getSupplementProducts failed', error);
      throw new InternalServerErrorException('Failed to fetch supplement products');
    }
  }

  /**
   * Single supplement product detail.
   * Includes purchasePageUrl — used for the "Buy Now" button.
   */
  async getSupplementProductById(productId: string): Promise<any> {
    const product = await this.prisma.supplementProduct.findFirst({
      where: { id: productId, isActive: true },
    });

    if (!product) {
      throw new NotFoundException(`Supplement product with ID "${productId}" not found`);
    }

    return product;
  }

  /**
   * Products grouped by category.
   * Useful for category-tab layouts in the shop screen.
   * Returns: { FOUNDATION: [...], PERFORMANCE: [...], RECOVERY: [...], OPTIONAL: [...] }
   */
  async getSupplementProductsGrouped(): Promise<Record<string, any[]>> {
    try {
      const products = await this.prisma.supplementProduct.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id:             true,
          name:           true,
          category:       true,
          price:          true,
          currency:       true,
          vendorName:     true,
          purchasePageUrl: true,
          benefits:       true,
          imageUrl:       true,
          inStock:        true,
        },
      });

      return products.reduce<Record<string, any[]>>((acc, product) => {
        const key = product.category;
        if (!acc[key]) acc[key] = [];
        acc[key].push(product);
        return acc;
      }, {});
    } catch (error) {
      this.logger.error('getSupplementProductsGrouped failed', error);
      throw new InternalServerErrorException('Failed to fetch grouped supplement products');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COACH — AFFILIATE PRODUCT MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Returns the full admin-managed AffiliateProduct catalog.
   * Coach browses this to find products to recommend to their clients.
   */
  async getAdminAffiliateCatalog(
    query: GetCatalogQueryDto,
  ): Promise<PaginatedResult<any>> {
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;
    const skip  = (page - 1) * limit;

    try {
      const [products, total] = await Promise.all([
        this.prisma.affiliateProduct.findMany({
          where: { isActive: true },
          include: {
            supplement: {
              select: { name: true, category: true, description: true },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          skip,
          take: limit,
        }),
        this.prisma.affiliateProduct.count({ where: { isActive: true } }),
      ]);

      return {
        data: products,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext:    page < Math.ceil(total / limit),
          hasPrev:    page > 1,
        },
      };
    } catch (error) {
      this.logger.error('getAdminAffiliateCatalog failed', error);
      throw new InternalServerErrorException('Failed to fetch affiliate catalog');
    }
  }

  /**
   * Returns all affiliate products linked by this coach.
   * These appear in the client's "Recommended by your coach" section.
   */
  async getCoachLinkedProducts(coachUserId: string): Promise<any[]> {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);

    return this.prisma.coachAffiliateProduct.findMany({
      where: { coachId: coachProfile.id, isActive: true },
      include: {
        affiliateProduct: {
          include: {
            supplement: { select: { name: true, category: true, description: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Links an AffiliateProduct to the coach's profile.
   * Idempotent — if already linked, updates the custom link/commission.
   */
  async linkAffiliateProduct(
    coachUserId:       string,
    affiliateProductId: string,
    dto:               LinkAffiliateProductDto,
  ): Promise<any> {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);

    const product = await this.prisma.affiliateProduct.findFirst({
      where: { id: affiliateProductId, isActive: true },
    });
    if (!product) {
      throw new NotFoundException(`Affiliate product with ID "${affiliateProductId}" not found`);
    }

    try {
      const linked = await this.prisma.coachAffiliateProduct.upsert({
        where: {
          coachId_affiliateProductId: {
            coachId:           coachProfile.id,
            affiliateProductId,
          },
        },
        create: {
          coachId:           coachProfile.id,
          affiliateProductId,
          customLink:        dto.customLink      ?? null,
          commissionRate:    dto.commissionRate  ?? null,
          isActive:          true,
        },
        update: {
          customLink:        dto.customLink      ?? null,
          commissionRate:    dto.commissionRate  ?? null,
          isActive:          true,
        },
        include: {
          affiliateProduct: {
            include: {
              supplement: { select: { name: true, category: true } },
            },
          },
        },
      });

      this.logger.log(
        `Coach ${coachUserId} linked affiliate product ${affiliateProductId}`,
      );
      return linked;
    } catch (error) {
      this.logger.error('linkAffiliateProduct failed', error);
      throw new InternalServerErrorException('Failed to link affiliate product');
    }
  }

  /**
   * Removes/hides an affiliate product from the coach's recommendations.
   * Soft-delete — sets isActive = false.
   */
  async unlinkAffiliateProduct(
    coachUserId:       string,
    affiliateProductId: string,
  ): Promise<{ success: boolean; message: string }> {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);

    const link = await this.prisma.coachAffiliateProduct.findUnique({
      where: {
        coachId_affiliateProductId: {
          coachId: coachProfile.id,
          affiliateProductId,
        },
      },
    });

    if (!link || !link.isActive) {
      throw new NotFoundException('This product is not in your recommendations list');
    }

    await this.prisma.coachAffiliateProduct.update({
      where: {
        coachId_affiliateProductId: {
          coachId: coachProfile.id,
          affiliateProductId,
        },
      },
      data: { isActive: false },
    });

    this.logger.log(
      `Coach ${coachUserId} unlinked affiliate product ${affiliateProductId}`,
    );

    return { success: true, message: 'Product removed from your recommendations' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLIENT — VIEW COACH RECOMMENDATIONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Returns products recommended by the client's coach.
   * Uses coach's custom affiliate link if set; otherwise falls back to default.
   * purchaseUrl → this is what the client's "Buy Now" button opens.
   */
  async getCoachRecommendedProducts(clientUserId: string): Promise<any[]> {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { userId: clientUserId },
      select: { coachId: true, status: true },
    });

    if (!clientProfile) {
      throw new NotFoundException(
        'Client profile not found. Accept a coach invitation first.',
      );
    }

    const linkedProducts = await this.prisma.coachAffiliateProduct.findMany({
      where: { coachId: clientProfile.coachId, isActive: true },
      include: {
        affiliateProduct: {
          include: {
            supplement: {
              select: { name: true, category: true, description: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return linkedProducts.map((lp) => ({
      id:           lp.affiliateProduct.id,
      name:         lp.affiliateProduct.name,
      brand:        lp.affiliateProduct.brand,
      description:  lp.affiliateProduct.description,
      imageUrl:     lp.affiliateProduct.imageUrl,
      price:        lp.affiliateProduct.price,
      currency:     lp.affiliateProduct.currency,
      features:     lp.affiliateProduct.features,
      isVerified:   lp.affiliateProduct.isVerified,
      supplement:   lp.affiliateProduct.supplement,
      // Coach's custom link takes priority over admin's default URL
      purchaseUrl:  lp.customLink ?? lp.affiliateProduct.affiliateUrl,
      hasCoachLink: !!lp.customLink,
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED — PURCHASE RECORDING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Records a completed affiliate purchase after the user has bought externally.
   * Called by both coaches and clients after completing checkout on the affiliate site.
   */
  async recordAffiliatePurchase(
    userId: string,
    dto:    RecordAffiliatePurchaseDto,
  ): Promise<any> {
    const product = await this.prisma.affiliateProduct.findFirst({
      where: { id: dto.affiliateProductId, isActive: true },
      select: { id: true, name: true },
    });

    if (!product) {
      throw new NotFoundException(
        `Affiliate product with ID "${dto.affiliateProductId}" not found`,
      );
    }

    // Validate referring coach if provided
    if (dto.referringCoachId) {
      const coach = await this.prisma.coachProfile.findUnique({
        where: { id: dto.referringCoachId },
        select: { id: true },
      });
      if (!coach) {
        throw new BadRequestException(
          `Referring coach with ID "${dto.referringCoachId}" not found`,
        );
      }
    }

    try {
      const purchase = await this.prisma.affiliatePurchase.create({
        data: {
          userId,
          affiliateProductId: dto.affiliateProductId,
          referringCoachId:   dto.referringCoachId ?? null,
          amount:             dto.amount,
          currency:           dto.currency?.toUpperCase() ?? 'USD',
          orderId:            dto.orderId ?? null,
        },
        include: {
          affiliateProduct: {
            select: { name: true, brand: true, imageUrl: true },
          },
        },
      });

      this.logger.log(
        `Purchase recorded: user ${userId} bought ${product.name} for ${dto.amount} ${dto.currency ?? 'USD'}`,
      );

      return {
        success:    true,
        purchaseId: purchase.id,
        product:    purchase.affiliateProduct,
        amount:     purchase.amount,
        currency:   purchase.currency,
        purchasedAt: purchase.purchasedAt,
      };
    } catch (error) {
      this.logger.error('recordAffiliatePurchase failed', error);
      throw new InternalServerErrorException('Failed to record purchase');
    }
  }

  /**
   * Returns the user's affiliate purchase history.
   */
  async getMyPurchaseHistory(userId: string): Promise<any[]> {
    return this.prisma.affiliatePurchase.findMany({
      where: { userId },
      include: {
        affiliateProduct: {
          select: { name: true, brand: true, imageUrl: true, affiliateUrl: true },
        },
      },
      orderBy: { purchasedAt: 'desc' },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private async getCoachProfileOrThrow(userId: string) {
    const coach = await this.prisma.coachProfile.findUnique({
      where: { userId },
      select: { id: true, gymName: true },
    });

    if (!coach) {
      throw new ForbiddenException(
        'Coach profile not found. This endpoint is for coaches only.',
      );
    }

    return coach;
  }
}