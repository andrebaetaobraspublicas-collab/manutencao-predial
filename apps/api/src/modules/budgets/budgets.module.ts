import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { FinanceModule } from '../finance/finance.module';

@Module({ imports: [FinanceModule], controllers: [BudgetsController], providers: [BudgetsService], exports: [BudgetsService] })
export class BudgetsModule {}

