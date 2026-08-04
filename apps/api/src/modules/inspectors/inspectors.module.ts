import { Module } from '@nestjs/common';
import { InspectorsController } from './inspectors.controller';
import { InspectorsService } from './inspectors.service';

@Module({ controllers: [InspectorsController], providers: [InspectorsService] })
export class InspectorsModule {}
