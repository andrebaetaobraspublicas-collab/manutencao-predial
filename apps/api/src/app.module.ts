import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configureBigIntJsonSerialization } from './common/serialization/bigint-json';
import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { MailModule } from './common/mail/mail.module';
import { MembersModule } from './modules/members/members.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OperationsModule } from './modules/operations/operations.module';
import { FinanceModule } from './modules/finance/finance.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { KpisModule } from './modules/kpis/kpis.module';

configureBigIntJsonSerialization();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnvironment,
    }),
    PrismaModule,
    MailModule,
    AuthModule,
    MembersModule,
    GeocodingModule,
    NotificationsModule,
    OperationsModule,
    HealthModule,
    BuildingsModule,
    SuppliersModule,
    ContractsModule,
    WorkOrdersModule,
    DashboardModule,
    ReportsModule,
    FinanceModule,
    BudgetsModule,
    MaintenanceModule,
    KpisModule,
    BillingModule,
  ],
})
export class AppModule {}
