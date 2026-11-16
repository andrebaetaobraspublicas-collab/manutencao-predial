import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { parseMySqlUrl } from './prisma/database-url';
import { MailModule } from './common/mail/mail.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { configureBigIntJsonSerialization } from './common/serialization/bigint-json';
import { AuthService } from './modules/auth/auth.service';
import { JwtStrategy } from './modules/auth/jwt.strategy';
import { GestaoLoginGuard } from './modules/auth/gestao-login.guard';
import { OperationsService } from './modules/operations/operations.service';
import { HealthModule } from './modules/health/health.module';
import { OrcaproService } from './modules/orcapro/orcapro.service';
import { OrcaproAccess } from './modules/orcapro/orcapro.guard';
import { InfraService } from './modules/infraestrutura/infra.service';
import { ContractDatabase } from './modules/contract-management/contract-db';
import { ContractService } from './modules/contract-management/contract.service';
import { ContractController } from './modules/contract-management/contract.controller';
import { ContractGuard } from './modules/contract-management/contract.guard';
import { ContractAccess } from './modules/contract-management/contract-access';
import { ContractFiles } from './modules/contract-management/contract-files';
import { ContractImport } from './modules/contract-management/contract-import';
import { ContractExport } from './modules/contract-management/contract-export';
import { ContractBillingService } from './modules/contract-management/contract-billing.service';
import { ContractBillingController, ContractBillingGuard } from './modules/contract-management/contract-billing.controller';
import { ContractSaasAccess } from './modules/contract-management/contract-saas-access';
import { ContractSaasService } from './modules/contract-management/contract-saas.service';
import { ContractSaasAudit, ContractSaasAuditInterceptor } from './modules/contract-management/contract-saas-audit';
import { ContractHelpController, ContractSaasController, ContractSaasGuard } from './modules/contract-management/contract-saas.controller';
import { ContractSources } from './modules/contract-management/contract-sources';
import { ContractStandaloneAuthController, ContractStandalonePlansController } from './modules/contract-management/contract-standalone-auth';
import { contractProduction } from './modules/contract-management/contract-environment';

export function validateGestaoEnvironment(raw: Record<string, unknown>) {
  const config = validateEnvironment(raw);
  const get = (key: string) => config[key];
  if (!contractProduction({ get } as any) || config.GESTAO_ENABLED !== 'true') throw new Error('Aplicação exclusiva da Gestão Contratual exige seu domínio e configuração próprios.');
  for (const key of ['DATABASE_URL', 'GESTAO_DATABASE_URL']) if (parseMySqlUrl(String(config[key] || '')).database !== 'u528277311_gestao_live') throw new Error('Banco de produção da Gestão Contratual fora da lista autorizada.');
  if (config.DATABASE_URL !== config.GESTAO_DATABASE_URL) throw new Error('Identidade e contratos devem usar o mesmo banco exclusivo.');
  for (const key of ['GESTAO_SOURCE_ORCAPRO_AUTH_URL', 'GESTAO_SOURCE_INFRA_AUTH_URL', 'GESTAO_SOURCE_INFRA_DATA_URL']) if (parseMySqlUrl(String(config[key] || '')).database === 'u528277311_gestao_live') throw new Error('Banco de origem inválido.');
  if (config.ORCAPRO_ENABLED === 'true' || config.INFRA_ENABLED === 'true') throw new Error('Os demais produtos não podem ser ativados nesta aplicação.');
  return config;
}
configureBigIntJsonSerialization();
/** No OrçaPro/Infra controllers, background workers or source write providers. */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateGestaoEnvironment }), PrismaModule, MailModule, PassportModule, HealthModule,
    JwtModule.registerAsync({ inject: [ConfigService], useFactory: (config: ConfigService): JwtModuleOptions => ({ secret: config.getOrThrow('JWT_ACCESS_SECRET'), signOptions: { expiresIn: '15m' } }) })],
  controllers: [ContractStandaloneAuthController, ContractStandalonePlansController, ContractController, ContractBillingController, ContractSaasController, ContractHelpController],
  providers: [AuthService, OperationsService, JwtStrategy, GestaoLoginGuard, ContractSources, ContractDatabase, ContractService, ContractGuard, ContractAccess, ContractFiles, ContractImport, ContractExport, ContractBillingService, ContractBillingGuard, ContractSaasAccess, ContractSaasService, ContractSaasAudit, ContractSaasGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }, { provide: APP_INTERCEPTOR, useClass: ContractSaasAuditInterceptor },
    { provide: 'GESTAO_BILLING', useExisting: ContractBillingService },
    { provide: OrcaproService, inject: [ContractSources], useFactory: (sources: ContractSources) => sources.orcaAdapter() },
    { provide: OrcaproAccess, inject: [ContractSources], useFactory: (sources: ContractSources) => sources.accessAdapter() },
    { provide: InfraService, inject: [ContractSources], useFactory: (sources: ContractSources) => sources.infraAdapter() }],
})
export class GestaoAppModule {}
