import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { BudgetItemKind, BudgetStatus, SinapiItemType } from '../../../generated/prisma/client';

export class SinapiCatalogItemDto {
  @IsEnum(SinapiItemType) type!: SinapiItemType;
  @IsString() @Length(1, 40) code!: string;
  @IsString() @Length(2, 10000) description!: string;
  @IsString() @Length(1, 20) unit!: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) unitCost!: number;
  @IsOptional() compositionData?: Record<string, unknown>;
}

export class ImportSinapiCatalogDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) referenceMonth!: string;
  @Matches(/^[A-Za-z]{2}$/) state!: string;
  @IsOptional() @IsString() @Length(1, 40) source?: string;
  @IsString() @Length(1, 40) version!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20000)
  @ValidateNested({ each: true }) @Type(() => SinapiCatalogItemDto)
  items!: SinapiCatalogItemDto[];
}

export enum CatalogFileSource {
  SINAPI = 'SINAPI',
  CUSTOM = 'CUSTOM',
}

export class ImportCatalogFileDto {
  @IsEnum(CatalogFileSource)
  sourceType!: CatalogFileSource;

  @Matches(/^[A-Za-z]{2}$/)
  state!: string;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  referenceMonth?: string;

  @IsString()
  @Length(1, 30)
  version!: string;
}

export class BudgetItemDto {
  @IsOptional() @IsUUID() catalogItemId?: string;
  @IsOptional() @IsEnum(BudgetItemKind) kind?: BudgetItemKind;
  @IsOptional() @IsString() @Length(1, 40) code?: string;
  @IsOptional() @IsString() @Length(2, 10000) description?: string;
  @IsOptional() @IsString() @Length(1, 20) unit?: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @IsPositive() quantity!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) unitCost?: number;
}

export class SaveBudgetDto {
  @IsOptional() @IsUUID() catalogId?: string;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) referenceMonth?: string;
  @IsOptional() @Matches(/^[A-Za-z]{2}$/) state?: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(1000) bdiPercentage!: number;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000)
  @ValidateNested({ each: true }) @Type(() => BudgetItemDto)
  items!: BudgetItemDto[];
}

export class TransitionBudgetDto {
  @ApiProperty({ enum: BudgetStatus }) @IsEnum(BudgetStatus) status!: BudgetStatus;
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsString() @Length(2, 5000) note?: string;
}

