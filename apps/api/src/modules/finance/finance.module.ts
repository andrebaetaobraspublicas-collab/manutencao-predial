import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { KpisModule } from '../kpis/kpis.module';
import { FinancialReconciliationService } from './financial-reconciliation.service';

@Module({
  imports: [KpisModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinancialReconciliationService],
  exports: [FinanceService, FinancialReconciliationService],
})
export class FinanceModule {}

