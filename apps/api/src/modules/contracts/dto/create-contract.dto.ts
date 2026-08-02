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
import { ContractStatus, ContractType } from '../../../generated/prisma/client';

export class CreateContractDto {
  @ApiProperty({ example: 'CT-2026/001' })
  @IsString()
  @Length(1, 80)
  code!: string;

  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiProperty({ example: 'Manutenção preventiva e corretiva das edificações.' })
  @IsString()
  object!: string;

  @ApiProperty({ enum: ContractType })
  @IsEnum(ContractType)
  type!: ContractType;

  @ApiPropertyOptional({ enum: ContractStatus, default: ContractStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ example: 1500000 })
  @IsNumber()
  @IsPositive()
  originalValue!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  buildingIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  managerUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  inspectorUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  administrativeProcess?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
