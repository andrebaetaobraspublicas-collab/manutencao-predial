import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BmExportReceiptDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty() @Matches(/^[a-f0-9]{64}$/) sourceHash!: string;
  @ApiProperty() @Matches(/^[a-f0-9]{64}$/) fileHash!: string;
  @ApiProperty() @Matches(/^[a-f0-9]{64}$/) configHash!: string;
  @ApiProperty({enum:['documentation','example']}) @IsIn(['documentation','example']) profile!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(10000) services!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(999) groups!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(999) fronts!: number;
  @ApiProperty() @IsString() @MaxLength(100) submeta!: string;
  @ApiProperty() @Matches(/^\d{1,16}$/) originalCents!: string;
  @ApiProperty() @Matches(/^\d{1,16}$/) exportCents!: string;
}
export class PleExportReceiptDto extends BmExportReceiptDto {
  @ApiProperty() @IsInt() @Min(1) @Max(999) events!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(100000) completions!: number;
}
export class CompatibleCopyRowDto {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_.:-]{1,160}$/) id!: string;
  @ApiProperty() @Matches(/^\d{1,8}\.\d{2}$/) quantity!: string;
  @ApiProperty() @Matches(/^\d{1,10}\.\d{2}$/) cost!: string;
}
export class CompatibleCopyDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty() @Matches(/^[a-f0-9]{64}$/) sourceHash!: string;
  @ApiProperty({description:'Identificador da nova cópia; repetir a mesma solicitação não cria outra cópia.'}) @IsUUID() requestId!: string;
  @ApiProperty({type:[CompatibleCopyRowDto]}) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10000) @ValidateNested({each:true}) @Type(()=>CompatibleCopyRowDto) rows!: CompatibleCopyRowDto[];
}
export function compatibleCopyData(project:{id:string;version:number;data:unknown},dto:CompatibleCopyDto):Record<string,any> {
  if(project.version!==dto.expectedVersion||createHash('sha256').update(canonicalBm(project.data)).digest('hex')!==dto.sourceHash)throw new ConflictException('A origem mudou após a prévia. Reabra o assistente; nenhuma cópia foi criada.');
  const engine=require(path.join(__dirname,'../modules/orcapro/legacy/assets/transferegov-compatibility.js')) as {makeDocument:(source:unknown,rows:unknown,meta:unknown)=>Record<string,any>};
  try{return engine.makeDocument(project.data,dto.rows,{sourceProjectId:project.id,sourceVersion:project.version,sourceHash:dto.sourceHash,requestId:dto.requestId});}catch(error){throw new BadRequestException(error instanceof Error?error.message:'Normalização inválida.');}
}
export const canonicalBm = (value: unknown) => JSON.stringify(value,(_key,v)=>v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
export function assertBmDevelopment(webBase: string | undefined) {
  try { const u=new URL(webBase??'');if(['https:','http:'].includes(u.protocol)&&['gestaodepredios.com.br','www.gestaodepredios.com.br','localhost','127.0.0.1','[::1]'].includes(u.hostname)&&!u.username&&!u.password&&u.pathname==='/')return; } catch { /* Fail closed on a missing or malformed environment. */ }
  throw new NotFoundException('Exportação TransfereGov disponível somente no desenvolvimento.');
}
export function pleReceipt(project:{version:number;data:unknown},dto:PleExportReceiptDto) {
  return {...bmReceipt(project,dto),format:'TransfereGov PLE',layoutVersion:'transferegov-ple-2026.1',events:dto.events,completions:dto.completions};
}
export function bmReceipt(project:{version:number;data:unknown},dto:BmExportReceiptDto) {
  const expected=createHash('sha256').update(canonicalBm(project.data)).digest('hex');
  if(project.version!==dto.expectedVersion||expected!==dto.sourceHash)throw new ConflictException('A versão salva mudou. Reabra o assistente para gerar uma nova fotografia.');
  return {format:'TransfereGov BM',layoutVersion:'transferegov-bm-2026.1',sourceVersion:project.version,sourceHash:expected,fileHash:dto.fileHash,configHash:dto.configHash,profile:dto.profile,services:dto.services,groups:dto.groups,fronts:dto.fronts,submeta:dto.submeta,originalCents:dto.originalCents,exportCents:dto.exportCents,status:'PREPARED',homologated:false};
}
