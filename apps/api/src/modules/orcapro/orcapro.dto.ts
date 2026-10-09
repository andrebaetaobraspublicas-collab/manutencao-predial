import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { REGIMES } from './orcapro-domain';

export class CatalogQuery {
  @ApiProperty() @IsUUID() referenceId!: string;
  @ApiPropertyOptional({ default: 'SP' }) @IsOptional() @Matches(/^[A-Z]{2}$/) uf = 'SP';
  @ApiPropertyOptional({ enum: REGIMES, default: 'SD' }) @IsOptional() @IsIn(REGIMES) regime: 'SD'|'CD'|'SE' = 'SD';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) nature?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) group?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ default: 30 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 30;
}
export class ContextQuery {
  @ApiProperty() @IsUUID() referenceId!: string;
  @ApiPropertyOptional({ default: 'SP' }) @IsOptional() @Matches(/^[A-Z]{2}$/) uf = 'SP';
  @ApiPropertyOptional({ enum: REGIMES, default: 'SD' }) @IsOptional() @IsIn(REGIMES) regime: 'SD'|'CD'|'SE' = 'SD';
}
export class BundleQuery extends ContextQuery {
  @ApiPropertyOptional({ description: 'Até 500 códigos de composição separados por vírgula.' }) @IsOptional() @IsString() @MaxLength(7000) codes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(7000) inputCodes?: string;
}
export class CreateProjectDto {
  @ApiProperty() @IsString() @MaxLength(160) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() referenceId?: string;
  @ApiPropertyOptional({ default: 'SP' }) @IsOptional() @Matches(/^[A-Z]{2}$/) uf = 'SP';
  @ApiPropertyOptional({ enum: REGIMES }) @IsOptional() @IsIn(REGIMES) regime: 'SD'|'CD'|'SE' = 'SD';
  @ApiPropertyOptional({ description: 'Documento privado legado; catálogo oficial proibido.' }) @IsOptional() @IsObject() data?: Record<string, unknown>;
}
export class SaveProjectDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() referenceId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{2}$/) uf?: string;
  @ApiPropertyOptional({ enum: REGIMES }) @IsOptional() @IsIn(REGIMES) regime?: 'SD'|'CD'|'SE';
  @ApiProperty() @IsObject() data!: Record<string, unknown>;
}
export class CloneTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) name?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{2}$/) uf?: string;
  @ApiPropertyOptional({ enum: REGIMES }) @IsOptional() @IsIn(REGIMES) regime?: 'SD'|'CD'|'SE';
}
export class ReferenceDto {
  @ApiProperty() @IsUUID() referenceId!: string;
}
export class ImportSinapiDto {
  @ApiProperty({ description: 'Estrutura raw extraída do importador SINAPI legado; preços em centavos.' }) @IsObject() raw!: Record<string, unknown>;
  @ApiProperty() @IsString() @MaxLength(255) sourceName!: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Max(999) revision = 1;
  @ApiPropertyOptional({ description: 'Referência publicada/arquivada usada na comparação.' }) @IsOptional() @IsUUID() baselineReferenceId?: string;
}
export class ImportSinapiFileDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(999) revision = 1;
  @ApiPropertyOptional() @IsOptional() @IsUUID() baselineReferenceId?: string;
}
export class ImportReportQuery {
  @ApiPropertyOptional({ enum: ['I','C'] }) @IsOptional() @IsIn(['I','C']) kind?: 'I'|'C';
  @ApiPropertyOptional({ enum: ['ADDED','CHANGED','REMOVED','NEW'] }) @IsOptional() @IsIn(['ADDED','CHANGED','REMOVED','NEW']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) search?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ default: 30 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 30;
}
export class RevisionDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}
export class RestoreDto extends RevisionDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
export class AdaptCompositionDto extends ReferenceDto {}
export class CustomRecordDto {
  @ApiProperty() @IsObject() data!: Record<string, unknown>;
}
export class UserAccessDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
}
export class AdminListQuery {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 50;
}
export class ProjectListQuery {
  @ApiPropertyOptional({ enum: ['true','false'] }) @IsOptional() @IsIn(['true','false']) archived = 'false';
}
