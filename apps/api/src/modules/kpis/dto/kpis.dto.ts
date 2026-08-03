import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber,
  IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateNested,
} from 'class-validator';
import {
  KpiAdjustmentType, KpiAggregation, KpiCategory, KpiDirection, KpiFinancialRole,
  KpiPeriodicity,
} from '../../../generated/prisma/client';

export class CalculateKpisDto {
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsUUID() buildingId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() workOrderId?: string;
  @IsOptional() @IsUUID() maintenancePlanId?: string;
  @IsOptional() @IsUUID() assetId?: string;
}

export class KpiTrendQuery {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(36)
  periods = 12;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() buildingId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
}

export class KpiDefinitionsQuery {
  @IsOptional() @IsEnum(KpiCategory) category?: KpiCategory;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @Length(1, 120) search?: string;
}

export class CreateKpiDefinitionDto {
  @IsString() @Length(2, 80) @Matches(/^[A-Z0-9_]+$/) code!: string;
  @IsString() @Length(2, 180) name!: string;
  @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: KpiCategory }) @IsEnum(KpiCategory) category!: KpiCategory;
  @IsString() @Length(1, 40) unit!: string;
  @ApiProperty({ enum: KpiDirection }) @IsEnum(KpiDirection) direction!: KpiDirection;
  @ApiPropertyOptional({ enum: KpiPeriodicity }) @IsOptional() @IsEnum(KpiPeriodicity) periodicity?: KpiPeriodicity;
  @ApiPropertyOptional({ enum: KpiAggregation }) @IsOptional() @IsEnum(KpiAggregation) aggregation?: KpiAggregation;
  @IsOptional() @IsString() @Length(2, 100) calculationMethod?: string;
  @IsString() @Length(2, 5000) formula!: string;
  @IsOptional() @IsString() formulaExample?: string;
  @IsOptional() @IsString() objective?: string;
  @IsOptional() @IsString() @Length(2, 220) dataSource?: string;
  @IsOptional() @IsString() @Length(2, 180) acceptableRange?: string;
  @IsOptional() @IsString() @Length(2, 120) responsibleRole?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) defaultWeight?: number;
  @IsOptional() @IsString() deductionCriteria?: string;
  @IsOptional() @IsString() bonusCriteria?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) targetValue?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) warningValue?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) criticalValue?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) benchmarkValue?: number;
  @IsOptional() @IsObject() formulaConfig?: Record<string, unknown>;
}

export class UpdateKpiDefinitionDto extends PartialType(CreateKpiDefinitionDto) {
  @IsOptional() @IsBoolean() active?: boolean;
}

export class KpiBandDto {
  @IsString() @Length(2, 80) label!: string;
  @IsString() @Length(2, 30) rating!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) minValue?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) maxValue?: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) score!: number;
  @ApiPropertyOptional({ enum: KpiAdjustmentType }) @IsOptional() @IsEnum(KpiAdjustmentType) adjustmentType?: KpiAdjustmentType;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) adjustmentPercent?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) fixedAmount?: number;
  @IsOptional() @IsBoolean() triggerActionPlan?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class BindContractKpiDto {
  @IsUUID() definitionId!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) targetValue?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) warningValue?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) criticalValue?: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) weight!: number;
  @ApiProperty({ enum: KpiFinancialRole }) @IsEnum(KpiFinancialRole) financialRole!: KpiFinancialRole;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) deductionCapPercent?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) bonusCapPercent?: number;
  @IsOptional() @IsInt() @Min(0) @Max(6) roundingScale?: number;
  @IsOptional() @IsBoolean() actionPlanTrigger?: boolean;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => KpiBandDto)
  bands!: KpiBandDto[];
}

export class UpdateContractKpiDto extends PartialType(BindContractKpiDto) {
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateKpiDataPointDto {
  @IsUUID() definitionId!: string;
  @IsDateString() occurredAt!: string;
  @IsNumber({ maxDecimalPlaces: 6 }) value!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) numerator?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) denominator?: number;
  @IsOptional() @IsUUID() buildingId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @Length(1, 80) source?: string;
  @IsOptional() @IsString() @Length(1, 160) sourceReference?: string;
  @IsOptional() @IsObject() dimensions?: Record<string, unknown>;
  @IsOptional() @IsString() notes?: string;
}

export class ContractPerformanceDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) referenceMonth!: string;
  @IsOptional() @IsUUID() financialMeasurementId?: string;
}

export class ContractDashboardQuery {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) referenceMonth?: string;
}

export class KpiAlertsQuery {
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() openOnly = true;
}
