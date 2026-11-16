import { ArrayMaxSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class ContractSourceDto {
  @IsUUID() sourceProjectId!: string;
  @IsIn(['ORCAPRO','INFRA']) sourceProduct!: 'ORCAPRO'|'INFRA';
  @IsIn(['UNIT_PRICE','GLOBAL_PRICE']) regime!: 'UNIT_PRICE'|'GLOBAL_PRICE';
  @IsInt() @Min(1) expectedSourceVersion!: number;
}
export class DemoContractDto extends ContractSourceDto {
  @IsOptional() @IsIn(['BUILDING_ANALYTICAL_V3']) demoScenario?: 'BUILDING_ANALYTICAL_V3';
  @IsOptional() @IsString() @MaxLength(2000) scenarioReason?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10000) proposalPrices?: Array<{itemId:string;price:string}>;
  @IsOptional() @IsArray() @ArrayMaxSize(10000) referencePrices?: Array<{itemId:string;price:string}>;
  @IsOptional() @IsArray() @ArrayMaxSize(1000) eventDefinitions?: Array<{id:string;name:string;value:string;parentId?:string;deadline?:number}>;
}
export class CreateContractDto extends ContractSourceDto {
 @ApiProperty({description:'SHA-256 da prévia autorizada da origem'}) @IsString() @MaxLength(64) sourceHash!:string;
 @IsString() @MaxLength(240) name!:string;
 @IsArray() @ArrayMaxSize(10000) referencePrices!:Array<{itemId:string;price:string}>;
 @IsString() @MaxLength(10) baseDate!:string;
 @IsString() @MaxLength(2000) reason!:string;
 @IsOptional() @IsArray() @ArrayMaxSize(1000) eventDefinitions?:Array<{id:string;name:string;value:string;parentId?:string;deadline?:number}>;
}
export class ContractMemberDto { @IsUUID() userId!:string; @IsIn(['MANAGER','FISCAL','READER','REVOKED']) role!:'MANAGER'|'FISCAL'|'READER'|'REVOKED'; }
export class MapContractImportDto {
 @IsString() @MaxLength(100) sheet!:string;
 @IsInt() @Min(1) headerRow!:number;
 @ApiProperty({description:'Índices de coluna base zero: code, description, unit, quantity, unitPrice, referencePrice'}) @IsObject() mapping!:Record<string,number>;
 @IsOptional() @IsArray() @ArrayMaxSize(10000) referenceOverrides?:Array<{row:number;price:string}>;
 @IsOptional() @IsArray() @ArrayMaxSize(10000) excludedRows?:number[];
 @IsOptional() @IsString() @MaxLength(2000) exclusionReason?:string;
}
export class ConfirmContractImportDto {
 @IsString() @MaxLength(64) hash!:string;
 @IsString() @MaxLength(240) name!:string;
 @IsIn(['UNIT_PRICE','GLOBAL_PRICE']) regime!:'UNIT_PRICE'|'GLOBAL_PRICE';
 @IsString() @MaxLength(10) baseDate!:string;
 @IsString() @MaxLength(2000) reason!:string;
 @IsOptional() @IsArray() @ArrayMaxSize(1000) eventDefinitions?:Array<{id:string;name:string;value:string;parentId?:string;deadline?:number}>;
}
export class MapMeasurementImportDto {
 @IsUUID() contractId!:string;
 @IsString() @MaxLength(100) sheet!:string;
 @IsInt() @Min(1) headerRow!:number;
 @IsObject() mapping!:{code:number;quantity:number};
 @ApiProperty({required:false,enum:['CODE','NUMBER'],description:'CODE: código da composição; NUMBER: número do item no orçamento. Eventos usam sempre sua identificação.'}) @IsOptional() @IsIn(['CODE','NUMBER']) identifierKind?:'CODE'|'NUMBER';
 @IsOptional() @IsInt() @Min(1) expectedVersion?:number;
 @IsOptional() @IsArray() @ArrayMaxSize(10000) itemMappings?:Array<{row:number;itemId:string}>;
 @IsOptional() @IsArray() @ArrayMaxSize(10000) excludedRows?:number[];
 @IsOptional() @IsString() @MaxLength(2000) exclusionReason?:string;
}
export class ConfirmMeasurementImportDto {
 @IsUUID() contractId!:string;
 @IsString() @MaxLength(64) hash!:string;
 @IsInt() @Min(1) expectedVersion!:number;
 @IsUUID() requestId!:string;
 @IsString() @MaxLength(150) title!:string;
 @IsString() @MaxLength(30) period!:string;
 @IsString() @MaxLength(10) executionDate!:string;
 @IsString() @MaxLength(2500) evidence!:string;
}
export class ContractActionDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsUUID() requestId!: string;
  @IsIn(['amendment','compensation-reconciliation','price-rule','price-batch','measurement','difference-measurement','approve-measurement','cancel-measurement','payment','refund','progress','progress-items','metadata-enrichment','schedule-revision']) kind!: string;
  @IsObject() payload!: Record<string,any>;
  @IsOptional() @IsString() @MaxLength(64) previewHash?: string;
}
export class ContractPreviewDto {
 @IsInt() @Min(1) expectedVersion!:number;
 @IsOptional() @IsUUID() requestId?:string;
 @IsIn(['amendment','price-rule','price-batch','measurement','difference-measurement','metadata-enrichment','schedule-revision']) kind!:string;
 @IsObject() payload!:Record<string,any>;
}
export class ScheduleProposalDto {
 @IsInt() @Min(1) expectedVersion!:number;
 @IsString() @MaxLength(10) effectiveDate!:string;
}
