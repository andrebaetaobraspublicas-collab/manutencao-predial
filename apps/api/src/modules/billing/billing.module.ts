import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { OrcaproModule } from '../orcapro/orcapro.module';

@Module({ imports: [OrcaproModule], controllers: [BillingController], providers: [BillingService] })
export class BillingModule {}
