import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrcaproController } from './orcapro.controller';
import { OrcaproAccess, OrcaproGuard } from './orcapro.guard';
import { OrcaproService } from './orcapro.service';
import { OrcaproRiskService } from './orcapro-risk.service';
import { OrcaproRiskController } from './orcapro-risk.controller';
import { OrcaproSaasService } from './orcapro-saas.service';
import { OrcaproStripeService } from './orcapro-stripe.service';
import { OrcaproCustomerBillingController, OrcaproPublicBillingController, OrcaproSaasController, OrcaproStripeWebhookController } from './orcapro-saas.controller';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [ConfigModule, PrismaModule, AuthModule], controllers: [OrcaproController, OrcaproSaasController, OrcaproCustomerBillingController, OrcaproPublicBillingController, OrcaproStripeWebhookController, OrcaproRiskController], providers: [OrcaproAccess, OrcaproGuard, OrcaproService, OrcaproSaasService, OrcaproStripeService, OrcaproRiskService], exports: [OrcaproService, OrcaproAccess, OrcaproStripeService] })
export class OrcaproModule {}
