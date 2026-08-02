import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { WorkOrderStatus } from '../../../generated/prisma/client';

export class TransitionWorkOrderDto {
  @ApiProperty({ enum: WorkOrderStatus })
  @IsEnum(WorkOrderStatus)
  toStatus!: WorkOrderStatus;

  @ApiPropertyOptional({ description: 'Solução executada; obrigatória ao concluir a OS.' })
  @IsOptional()
  @IsString()
  @Length(3, 10_000)
  solution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 5_000)
  note?: string;
}
