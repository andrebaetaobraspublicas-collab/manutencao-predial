import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  OperationalCatalogKind,
  WorkOrderPriority,
} from '../../../generated/prisma/client';

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class ListCatalogItemsQuery {
  @ApiPropertyOptional({ enum: OperationalCatalogKind })
  @IsOptional()
  @IsEnum(OperationalCatalogKind)
  kind?: OperationalCatalogKind;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  activeOnly = true;
}

export class CreateCatalogItemDto {
  @ApiProperty({ enum: OperationalCatalogKind })
  @IsEnum(OperationalCatalogKind)
  kind!: OperationalCatalogKind;

  @ApiProperty({ example: 'ELETRICA' })
  @IsString()
  @Length(1, 60)
  code!: string;

  @ApiProperty({ example: 'Elétrica' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100000, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: WorkOrderPriority })
  @IsOptional()
  @IsEnum(WorkOrderPriority)
  defaultPriority?: WorkOrderPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requirePhotoBefore?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requirePhotoDuring?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requirePhotoAfter?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireChecklist?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireFinalCost?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireAcceptance?: boolean;
}

export class UpdateCatalogItemDto extends PartialType(CreateCatalogItemDto) {}

export class ChecklistTemplateItemDto {
  @ApiProperty({ example: 'Desligar e bloquear a alimentação elétrica' })
  @IsString()
  @Length(2, 240)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}

export class ReplaceChecklistTemplateDto {
  @ApiProperty({ type: [ChecklistTemplateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistTemplateItemDto)
  items!: ChecklistTemplateItemDto[];
}
