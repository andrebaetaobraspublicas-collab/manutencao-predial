import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrcaproController } from './orcapro.controller';
import { OrcaproAccess, OrcaproGuard } from './orcapro.guard';
import { OrcaproService } from './orcapro.service';

@Module({ imports: [ConfigModule, PrismaModule], controllers: [OrcaproController], providers: [OrcaproAccess, OrcaproGuard, OrcaproService], exports: [OrcaproService, OrcaproAccess] })
export class OrcaproModule {}
