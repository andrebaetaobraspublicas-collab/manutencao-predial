import { Module } from '@nestjs/common';
import {
  OperationsCatalogsController,
  OperationsSlaController,
} from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  controllers: [OperationsCatalogsController, OperationsSlaController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
