import { Module } from '@nestjs/common';
import { PilotController } from './pilot.controller';
import { PilotService } from './pilot.service';
import { FinanceModule } from '../finance/finance.module';

@Module({ imports: [FinanceModule], controllers: [PilotController], providers: [PilotService] })
export class PilotModule {}
