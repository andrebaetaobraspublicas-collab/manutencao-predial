import { AuthModule } from '../auth/auth.module';
import { GestaoLoginGuard } from '../auth/gestao-login.guard';
import { ContractRegistration, ContractRegistrationController } from './contract-registration';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OrcaproModule } from '../orcapro/orcapro.module';
import { InfraModule } from '../infraestrutura/infra.module';
import { ContractDatabase } from './contract-db';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';
import { ContractGuard } from './contract.guard';
import { ContractAccess } from './contract-access';
import { ContractFiles } from './contract-files';
import { ContractImport } from './contract-import';
import { ContractExport } from './contract-export';
import { ContractBillingService } from './contract-billing.service';
import { ContractBillingController, ContractBillingGuard } from './contract-billing.controller';
import { ContractSaasAccess } from './contract-saas-access';
import { ContractSaasService } from './contract-saas.service';
import { ContractSaasAudit, ContractSaasAuditInterceptor } from './contract-saas-audit';
import { ContractHelpController, ContractSaasController, ContractSaasGuard } from './contract-saas.controller';
@Module({imports:[AuthModule,OrcaproModule,InfraModule],controllers:[ContractRegistrationController,ContractController,ContractBillingController,ContractSaasController,ContractHelpController],providers:[ContractRegistration,GestaoLoginGuard,ContractDatabase,ContractService,ContractGuard,ContractAccess,ContractFiles,ContractImport,ContractExport,ContractBillingService,ContractBillingGuard,ContractSaasAccess,ContractSaasService,ContractSaasAudit,ContractSaasGuard,{provide:APP_INTERCEPTOR,useClass:ContractSaasAuditInterceptor},{provide:'GESTAO_BILLING',useExisting:ContractBillingService}]})
export class ContractManagementModule {}

