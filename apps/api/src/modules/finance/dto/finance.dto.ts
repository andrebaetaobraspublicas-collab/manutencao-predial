import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { CommitmentMovementType, MeasurementStatus } from '../../../generated/prisma/client';

export class CreateCommitmentDto {
  @IsUUID() contractId!: string;
  @IsString() @Length(1, 80) number!: string;
  @IsInt() @Min(2000) fiscalYear!: number;
  @IsDateString() issueDate!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() originalValue!: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateCommitmentMovementDto {
  @ApiProperty({ enum: CommitmentMovementType })
  @IsEnum(CommitmentMovementType)
  type!: CommitmentMovementType;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @Length(1, 120) documentRef?: string;
  @IsOptional() @IsString() notes?: string;
}

export class MeasurementItemDto {
  @IsUUID() workOrderId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) deductionAmount?: number;
  @IsOptional() @IsString() description?: string;
}

export class CreateMeasurementDto {
  @IsUUID() contractId!: string;
  @IsOptional() @IsUUID() commitmentId?: string;
  @IsString() @Length(1, 60) number!: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) referenceMonth!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => MeasurementItemDto)
  items!: MeasurementItemDto[];
}

export class ConsolidateMeasurementDto {
  @IsUUID() contractId!: string;
  @IsOptional() @IsUUID() commitmentId?: string;
  @IsString() @Length(1, 60) number!: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) referenceMonth!: string;
  @IsOptional() @IsString() notes?: string;
}

export class TransitionMeasurementDto {
  @ApiProperty({ enum: MeasurementStatus })
  @IsEnum(MeasurementStatus)
  status!: MeasurementStatus;

  @ApiPropertyOptional({ description: 'Versão lida pelo cliente para controle de concorrência.' })
  @IsInt() @Min(0) version!: number;

  @IsOptional() @IsString() @Length(2, 5000) note?: string;
}

