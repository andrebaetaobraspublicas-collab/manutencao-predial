import { Module } from '@nestjs/common';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({ imports: [WorkOrdersModule], controllers: [MaintenanceController], providers: [MaintenanceService] })
export class MaintenanceModule {}

