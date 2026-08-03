import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SupplierKind } from '../../../generated/prisma/client';

export class SupplierConsortiumMemberDto {
  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  participationPercentage?: number;

  @IsOptional()
  @IsBoolean()
  isLeader?: boolean;
}

export class CreateSupplierDto {
  @ApiPropertyOptional({ enum: SupplierKind, default: SupplierKind.COMPANY })
  @IsOptional()
  @IsEnum(SupplierKind)
  kind?: SupplierKind;

  @ApiProperty({ example: 'Manutenção Predial Brasil Ltda.' })
  @IsString()
  @Length(2, 200)
  legalName!: string;

  @ApiPropertyOptional({ example: 'MPB Serviços' })
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiProperty({ example: '12.345.678/0001-90' })
  @IsString()
  @Length(8, 24)
  taxId!: string;

  @ApiPropertyOptional({ example: 'contato@fornecedor.com.br' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '(61) 3333-4444' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Maria da Silva' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({ type: [String], description: 'Especialidades ativas da configuração operacional.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  serviceAreaCategoryIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 240)
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'MG' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @ApiPropertyOptional({ example: '30110-012' })
  @IsOptional()
  @IsString()
  @Length(8, 12)
  postalCode?: string;

  @ApiPropertyOptional({ type: [SupplierConsortiumMemberDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SupplierConsortiumMemberDto)
  consortiumMembers?: SupplierConsortiumMemberDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
