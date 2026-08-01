import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [DashboardModule, WorkOrdersModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
