import { Module } from '@nestjs/common';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [WorkOrdersModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
