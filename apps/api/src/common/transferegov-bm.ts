import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

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
