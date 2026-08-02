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

configureBigIntJsonSerialization();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    BuildingsModule,
    SuppliersModule,
    ContractsModule,
    WorkOrdersModule,
    DashboardModule,
    ReportsModule,
    BillingModule,
  ],
})
export class AppModule {}
