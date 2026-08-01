import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { WorkOrderOrigin, WorkOrderPriority } from '../../../generated/prisma/client';

export class CreateWorkOrderDto {
  @ApiProperty()
  @IsUUID()
  buildingId!: string;

  @ApiProperty({ example: 'Vazamento no banheiro do 3º pavimento' })
  @IsString()
  @Length(3, 220)
  title!: string;

  @ApiProperty({ example: 'Foi identificado vazamento contínuo próximo à prumada.' })
  @IsString()
  @Length(3, 10000)
  description!: string;

  @ApiPropertyOptional({ example: '3º pavimento, banheiro masculino' })
  @IsOptional()
  @IsString()
  locationDetail?: string;

  @ApiPropertyOptional({ enum: WorkOrderPriority, default: WorkOrderPriority.NORMAL })
  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @ApiPropertyOptional({ enum: WorkOrderOrigin, default: WorkOrderOrigin.USER_REQUEST })
  @IsOptional()
  @IsEnum(WorkOrderOrigin)
  origin?: WorkOrderOrigin;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  requesterUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  contractIds?: string[];

  @ApiPropertyOptional({ example: '2026-08-10T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ example: 2500 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  estimatedCost?: number;
}
