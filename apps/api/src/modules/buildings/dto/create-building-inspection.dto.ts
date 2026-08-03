import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { BuildingInspectionType } from '../../../generated/prisma/client';

export class CreateBuildingInspectionDto {
  @ApiProperty({ example: '2026-08-03' })
  @IsDateString()
  inspectionDate!: string;

  @ApiProperty({ enum: BuildingInspectionType, example: BuildingInspectionType.PREVENTIVE })
  @IsEnum(BuildingInspectionType)
  type!: BuildingInspectionType;

  @ApiProperty({ example: 'Eng. Maria da Silva - CREA 000000/D' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  responsibleTechnician!: string;

  @ApiPropertyOptional({ example: 'Equipe de manutenção predial' })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  team?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
