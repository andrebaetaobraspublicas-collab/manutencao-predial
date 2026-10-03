import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
export class RiskCreateDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty() @IsString() @MaxLength(160) name!: string;
}
export class RiskSaveDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty() @IsObject() config!: Record<string,unknown>;
}
export class RiskVersionDto { @ApiProperty() @IsInt() @Min(1) expectedVersion!: number; }
export class RiskBdiDto extends RiskVersionDto {
  @ApiProperty({ enum:['param','exato','simples'] }) @IsIn(['param','exato','simples']) method!: string;
  @ApiProperty({ enum:['replace','add'] }) @IsIn(['replace','add']) mode!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() confirmDoubleCounting = false;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason = '';
}
