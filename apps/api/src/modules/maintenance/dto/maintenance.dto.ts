import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  AssetCriticality,
  AssetStatus,
  FrequencyUnit,
  MaintenancePlanType,
  WorkOrderPriority,
} from '../../../generated/prisma/client';

export class CreateAssetDto {
  @IsUUID() buildingId!: string;
  @IsString() @Length(1, 80) tag!: string;
  @IsString() @Length(2, 180) name!: string;
  @IsString() @Length(2, 120) category!: string;
  @IsOptional() @IsString() @Length(1, 180) location?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsEnum(AssetCriticality) criticality?: AssetCriticality;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsDateString() installedAt?: string;
  @IsOptional() @IsDateString() warrantyEndsAt?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class UpdateAssetDto extends PartialType(CreateAssetDto) {}

export class CreateMaintenancePlanDto {
  @IsUUID() buildingId!: string;
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() specialtyId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsString() @Length(2, 180) name!: string;
  @IsString() @Length(2, 220) titleTemplate!: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(MaintenancePlanType) type!: MaintenancePlanType;
  @IsEnum(FrequencyUnit) frequencyUnit!: FrequencyUnit;
  @IsInt() @Min(1) @Max(3650) frequencyValue!: number;
  @IsDateString() nextDueAt!: string;
  @IsOptional() @IsEnum(WorkOrderPriority) defaultPriority?: WorkOrderPriority;
  @IsOptional() @IsInt() @Min(0) @Max(365) advanceDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) generationHorizonDays?: number;
  @IsOptional() @IsObject() checklistTemplate?: Record<string, unknown>;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateMaintenancePlanDto extends PartialType(CreateMaintenancePlanDto) {}

export class GenerateMaintenanceQuery {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(365)
  horizonDays = 30;
}

