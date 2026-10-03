import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { InfraDatabase } from './infra-db';
import { InfraAccess, InfraGuard } from './infra.guard';
import { InfraService } from './infra.service';
import { InfraController } from './infra.controller';
import { InfraLoginController } from './infra-login.controller';
import { InfraLoginSecurity } from './infra-login-security';
import { InfraHealthController } from './infra-health.controller';
import { InfraSharedLoginInterceptor } from './infra-shared-login.interceptor';

@Module({ imports: [AuthModule],controllers: [InfraController,InfraLoginController,InfraHealthController],providers: [InfraDatabase,InfraAccess,InfraGuard,InfraService,InfraLoginSecurity,{ provide: APP_INTERCEPTOR,useClass: InfraSharedLoginInterceptor }],exports: [InfraDatabase] })
export class InfraModule {}
