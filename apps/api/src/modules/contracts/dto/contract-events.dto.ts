import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { AdjustmentType, AmendmentType, PenaltyType } from '../../../generated/prisma/client';

export class CreateContractAmendmentDto {
  @IsString() @Length(1, 60) number!: string;
  @ApiProperty({ enum: AmendmentType }) @IsEnum(AmendmentType) type!: AmendmentType;
  @IsString() @Length(3, 10000) description!: string;
  @IsOptional() @IsDateString() signedAt?: string;
  @IsOptional() @IsDateString() effectiveAt?: string;
  @ApiPropertyOptional({ description: 'Nova data final de vigência.' })
  @IsOptional() @IsDateString() endDateAfter?: string;
  @ApiPropertyOptional({ description: 'Valor positivo para acréscimo e negativo para supressão.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) valueChange?: number;
}

export class CreateContractAdjustmentDto {
  @ApiProperty({ enum: AdjustmentType }) @IsEnum(AdjustmentType) type!: AdjustmentType;
  @IsString() @Length(4, 20) referencePeriod!: string;
  @IsOptional() @IsDateString() requestDate?: string;
  @IsDateString() approvalDate!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) percentage?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) amount!: number;
  @IsOptional() @IsString() @Length(1, 100) indexName?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateContractSubcontractDto {
  @IsOptional() @IsUUID() supplierId?: string;
  @IsString() @Length(2, 200) subcontractorName!: string;
  @IsOptional() @IsString() @Length(8, 24) subcontractorTaxId?: string;
  @IsString() @Length(3, 10000) scope!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsDateString() approvedAt!: string;
  @IsString() @Length(1, 120) authorizationCase!: string;
}

export class CreateContractPenaltyDto {
  @ApiProperty({ enum: PenaltyType }) @IsEnum(PenaltyType) type!: PenaltyType;
  @IsOptional() @IsString() @Length(1, 120) administrativeCase?: string;
  @IsString() @Length(3, 10000) description!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsDateString() appliedAt!: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
