import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { InspectorProfileStatus } from '../../../generated/prisma/client';

export class CreateInspectorProfileDto {
  @ApiPropertyOptional({ description: 'Usuário do sistema vinculado ao fiscal, quando houver.' })
  @IsOptional() @IsUUID() userId?: string;
  @IsString() @Length(2, 160) name!: string;
  @IsString() @Length(1, 80) registrationNumber!: string;
  @IsOptional() @IsString() @Length(11, 14) cpf?: string;
  @IsString() @Length(2, 120) jobTitle!: string;
  @IsOptional() @IsString() @Length(2, 120) professionalEducation?: string;
  @IsOptional() @IsString() @Length(2, 80) professionalCouncil?: string;
  @IsOptional() @IsString() @Length(2, 160) department?: string;
  @IsOptional() @IsString() @Length(8, 30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @Length(2, 160) specialty!: string;
  @IsOptional() @IsEnum(InspectorProfileStatus) status?: InspectorProfileStatus;
  @IsOptional() @IsInt() @Min(1) @Max(168) availableHours?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) maxProcesses?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90) baseLatitude?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180) baseLongitude?: number;
  @IsOptional() @IsString() restrictedCompanies?: string;
  @IsOptional() @IsString() @Length(1, 220) designationOrdinance?: string;
  @IsOptional() @IsString() notes?: string;
}
