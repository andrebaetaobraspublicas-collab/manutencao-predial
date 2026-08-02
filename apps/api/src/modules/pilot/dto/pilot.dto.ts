import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export enum PilotDecisionOutcomeDto {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  BLOCKED = 'BLOCKED',
  PENDING = 'PENDING',
}

export enum PilotAcceptanceOutcomeDto {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class RecordPilotDecisionDto {
  @ApiProperty({ enum: PilotDecisionOutcomeDto })
  @IsEnum(PilotDecisionOutcomeDto)
  outcome!: PilotDecisionOutcomeDto;

  @ApiProperty()
  @IsString()
  @Length(3, 2000)
  note!: string;

  @ApiPropertyOptional({ description: 'Número da OS, relatório, chamado ou outra referência auditável.' })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  evidenceReference?: string;
}

export class RecordPilotAcceptanceDto {
  @ApiProperty({ enum: PilotAcceptanceOutcomeDto })
  @IsEnum(PilotAcceptanceOutcomeDto)
  outcome!: PilotAcceptanceOutcomeDto;

  @ApiProperty()
  @IsString()
  @Length(3, 2000)
  note!: string;
}
