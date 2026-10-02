import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

// Tenant CANCELED is the maintenance billing state. An existing OrçaPro
// customer can still authenticate to that separately contracted product.
// Organization suspension/deletion remains a block for both products.
export async function hasOrcaproAccount(userId: string, prisma: PrismaService, config: ConfigService): Promise<boolean> {
  if (config.get<string>('ORCAPRO_ENABLED') !== 'true') return false;
  if ((config.get<string>('ORCAPRO_ADMIN_USER_IDS') ?? '').split(',').map(id => id.trim()).includes(userId)) return true;
  const [grant, subscription] = await Promise.all([
    prisma.orcaproUserAccess.findUnique({ where: { userId } }),
    prisma.orcaproSubscription.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  return grant?.managed === true || !!subscription;
}
