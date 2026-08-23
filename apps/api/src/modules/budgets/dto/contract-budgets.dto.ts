import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ContractBudgetItemKind,
  ContractBudgetStatus,
} from '../../../generated/prisma/client';

function multipartBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return value;
}

export class ImportContractBudgetDto {
  @IsOptional()
  @IsString()
  @Length(1, 180)
  title?: string;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  referenceMonth?: string;

  @IsOptional()
  @Transform(({ value }) => multipartBoolean(value))
  @IsBoolean()
  replaceExisting = true;
}

export class ContractBudgetItemsQuery {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;

  @IsOptional()
  @IsEnum(ContractBudgetItemKind)
  kind?: ContractBudgetItemKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export class UpsertContractBudgetItemDto {
  @IsOptional()
  @IsUUID()
  catalogItemId?: string;

  @IsEnum(ContractBudgetItemKind)
  kind!: ContractBudgetItemKind;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  sectionCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 180)
  sectionName?: string;

  @IsString()
  @Length(1, 80)
  code!: string;

  @IsString()
  @Length(2, 10000)
  description!: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  technicalReference?: string;

  @IsString()
  @Length(1, 30)
  unit!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  laborUnitCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  materialUnitCost?: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1000)
  bdiPercentage?: number;

  @IsOptional()
  @IsBoolean()
  includedInTotal?: boolean;
}

export class ContractLaborComponentDto {
  @IsOptional() @IsString() @Length(1, 120) module?: string;
  @IsOptional() @IsString() @Length(1, 120) submodule?: string;
  @IsOptional() @IsString() @Length(1, 40) code?: string;
  @IsString() @Length(2, 10000) description!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 8 }) percentage?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount!: number;
  @IsOptional() @IsString() @Length(1, 255) basis?: string;
}

export class UpsertContractLaborPostDto {
  @IsString() @Length(1, 80) code!: string;
  @IsString() @Length(2, 255) title!: string;
  @IsOptional() @IsString() @Length(1, 30) unit?: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) postQuantity!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) employeesPerPost!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) professionalQuantity?: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) months!: number;
  @IsOptional() @IsString() @Length(1, 40) cbo?: string;
  @IsOptional() @IsString() @Length(1, 180) collectiveAgreement?: string;
  @IsOptional() @IsString() @Length(1, 80) mteRegistration?: string;
  @IsOptional() @IsString() @Length(1, 60) categoryBaseDate?: string;
  @IsOptional() @IsString() @Length(1, 80) shift?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) baseSalary!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) monthlyCostBeforeBdi!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) bdiAmount?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) monthlyCost!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) annualCost?: number;
  @IsOptional() @IsBoolean() includedInTotal?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ContractLaborComponentDto)
  components?: ContractLaborComponentDto[];
}

export class UpdateContractBudgetDto {
  @IsOptional() @IsString() @Length(1, 180) title?: string;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) referenceMonth?: string;
  @IsOptional() @IsEnum(ContractBudgetStatus) status?: ContractBudgetStatus;
  @IsOptional() @IsString() @Length(1, 10000) notes?: string;
}
