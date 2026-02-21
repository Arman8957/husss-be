import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface AuditParams {
  action: string;
  userId?: string;
  targetId?: string;
  ipAddress?: string;
  meta?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditParams): Promise<void> {
    this.logger.log(
      `[AUDIT] ${params.action} | user=${params.userId ?? 'anon'} | target=${params.targetId ?? '-'} | ip=${params.ipAddress ?? '-'}`,
    );

    if (!params.userId) return;

    // Best-effort DB write — never fails the calling request
    await this.prisma.userActivityLog
      .create({
        data: {
          userId: params.userId,
          type: params.action as any,
          meta: { ...(params.meta ?? {}), targetId: params.targetId, ipAddress: params.ipAddress },
        },
      })
      .catch((err) => {
        this.logger.warn(`Audit log DB write failed: ${err.message}`);
      });
  }
}