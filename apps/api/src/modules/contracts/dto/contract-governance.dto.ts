import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  ConstructionDiaryStatus,
  ContractApostilleType,
  ContractCommunicationPriority,
  ContractGuaranteeModality,
  ContractGuaranteeStatus,
  ContractInspectionRole,
  ContractReceiptDecision,
  ContractReceiptStatus,
  ContractReceiptType,
} from '../../../generated/prisma/client';

export class CreateContractInspectionTeamMemberDto {
  @IsUUID() inspectorProfileId!: string;
  @ApiProperty({ enum: ContractInspectionRole })
  @IsEnum(ContractInspectionRole) role!: ContractInspectionRole;
  @IsString() @Length(1, 220) designationAct!: string;
  @IsDateString() startsAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class CreateContractGuaranteeDto {
  @IsString() @Length(1, 120) number!: string;
  @ApiProperty({ enum: ContractGuaranteeModality })
  @IsEnum(ContractGuaranteeModality) modality!: ContractGuaranteeModality;
  @IsOptional() @IsString() @Length(1, 200) guarantorName?: string;
  @IsOptional() @IsString() @Length(8, 24) guarantorTaxId?: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) contractPercentage!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) guaranteedValue?: number;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) minimumPercentage!: number;
  @IsOptional() @IsDateString() issuedAt?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @ApiProperty({ enum: ContractGuaranteeStatus })
  @IsEnum(ContractGuaranteeStatus) status!: ContractGuaranteeStatus;
  @IsString() @Length(1, 120) workflow!: string;
  @IsOptional() @IsUUID() analystUserId?: string;
  @IsOptional() @IsUUID() analystInspectorId?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) executionValue?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) recoveredValue?: number;
  @IsOptional() @IsDateString() releasedAt?: string;
  @IsOptional() @IsString() coverages?: string;
  @IsOptional() @IsString() history?: string;
}

export class CreateContractApostilleDto {
  @IsString() @Length(1, 80) number!: string;
  @ApiProperty({ enum: ContractApostilleType })
  @IsEnum(ContractApostilleType) type!: ContractApostilleType;
  @IsDateString() date!: string;
  @IsOptional() @IsString() @Length(1, 100) indexName?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) percentage?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) valueChange?: number;
  @IsOptional() @IsString() calculationMemo?: string;
  @IsString() @Length(3, 10000) justification!: string;
}

export class CreateContractReceiptDto {
  @IsString() @Length(1, 100) number!: string;
  @ApiProperty({ enum: ContractReceiptType })
  @IsEnum(ContractReceiptType) type!: ContractReceiptType;
  @IsString() @Length(2, 120) objectCategory!: string;
  @IsOptional() @IsString() @Length(1, 120) requestProtocol?: string;
  @IsOptional() @IsDateString() protocolAt?: string;
  @IsOptional() @IsDateString() inspectionDate?: string;
  @IsOptional() @IsUUID() responsibleInspectorId?: string;
  @ApiProperty({ enum: ContractReceiptStatus })
  @IsEnum(ContractReceiptStatus) status!: ContractReceiptStatus;
  @IsBoolean() provisionalRequired!: boolean;
  @ApiProperty({ enum: ContractReceiptDecision })
  @IsEnum(ContractReceiptDecision) decision!: ContractReceiptDecision;
  @IsOptional() @IsString() @Length(1, 500) commissionOrdinance?: string;
  @IsOptional() @IsString() @Length(1, 80) quorum?: string;
  @IsOptional() @IsString() contractorDocuments?: string;
  @IsOptional() @IsString() inspectionsAndTests?: string;
  @IsOptional() @IsDateString() observationStartsAt?: string;
  @IsOptional() @IsDateString() observationEndsAt?: string;
  @IsOptional() @IsDateString() technicalWarrantyEndsAt?: string;
  @IsOptional() @IsString() occurrences?: string;
  @IsString() @Length(3, 10000) consolidatedOpinion!: string;
  @IsOptional() @IsString() @Length(1, 180) competentAuthority?: string;
  @ApiPropertyOptional({ description: 'Lista estruturada de pendências, criticidade, prazo e responsável.' })
  @IsOptional() @IsObject() pendingItems?: Record<string, unknown>;
}

export class CreateConstructionDiaryDto {
  @IsString() @Length(1, 100) number!: string;
  @IsOptional() @IsUUID() workOrderId?: string;
  @IsOptional() @IsUUID() responsibleInspectorId?: string;
  @IsDateString() date!: string;
  @IsOptional() @IsDateString() openedAt?: string;
  @IsOptional() @IsDateString() closedAt?: string;
  @IsString() @Length(2, 160) operationalSituation!: string;
  @IsOptional() @IsString() @Length(1, 80) weather?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) temperatureCelsius?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) precipitationMm?: number;
  @ApiProperty({ enum: ConstructionDiaryStatus })
  @IsEnum(ConstructionDiaryStatus) status!: ConstructionDiaryStatus;
  @IsOptional() @IsString() @Length(1, 180) workFront?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000) ownWorkforce?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) outsourcedWorkforce?: number;
  @IsOptional() @IsString() servicesPerformed?: string;
  @IsOptional() @IsString() servicesInProgress?: string;
  @IsOptional() @IsString() servicesCompleted?: string;
  @IsOptional() @IsString() equipmentMobilized?: string;
  @IsOptional() @IsString() equipmentDemobilized?: string;
  @IsOptional() @IsString() materialsReceived?: string;
  @IsOptional() @IsString() testsAndQualityControl?: string;
  @IsOptional() @IsString() occurrencesAndRisks?: string;
  @IsOptional() @IsString() @Length(1, 160) contractualImpact?: string;
  @IsOptional() @IsString() formalCommunications?: string;
  @IsOptional() @IsString() inspectionDirections?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateContractCommunicationClaimDto {
  @IsString() @Length(1, 100) number!: string;
  @IsString() @Length(2, 160) type!: string;
  @IsDateString() protocolDate!: string;
  @IsString() @Length(2, 100) sender!: string;
  @IsString() @Length(2, 100) recipient!: string;
  @IsOptional() @IsUUID() responsibleInspectorId?: string;
  @ApiProperty({ enum: ContractCommunicationPriority })
  @IsEnum(ContractCommunicationPriority) priority!: ContractCommunicationPriority;
  @IsString() @Length(2, 120) currentStatus!: string;
  @IsOptional() @IsString() @Length(1, 100) claimNature?: string;
  @IsString() @Length(2, 120) workflowStage!: string;
  @IsOptional() @IsDateString() instructionStartsAt?: string;
  @IsOptional() @IsDateString() instructionEndsAt?: string;
  @IsOptional() @IsInt() @Min(1) @Max(3650) standardDecisionDays?: number;
  @IsOptional() @IsDateString() decisionDeadline?: string;
  @IsOptional() @IsBoolean() extensionApproved?: boolean;
  @IsOptional() @IsString() extensionJustification?: string;
  @IsOptional() @IsDateString() technicalDeadline?: string;
  @IsOptional() @IsDateString() inspectionDeadline?: string;
  @IsOptional() @IsDateString() legalDeadline?: string;
  @IsOptional() @IsDateString() appealDeadline?: string;
  @IsString() @Length(2, 240) subject!: string;
  @IsString() @Length(3, 10000) detailedDescription!: string;
  @IsOptional() @IsString() technicalOpinion?: string;
  @IsOptional() @IsString() inspectionOpinion?: string;
  @IsOptional() @IsString() legalOpinion?: string;
  @IsOptional() @IsString() decision?: string;
  @IsOptional() @IsString() @Length(1, 120) forwardedModule?: string;
}
