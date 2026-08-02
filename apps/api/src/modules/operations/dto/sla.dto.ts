import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SlaTimeMode,
  WorkOrderPriority,
} from '../../../generated/prisma/client';

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export class SlaShiftDto {
  @ApiProperty({ type: [Number], example: [1, 2, 3, 4, 5] })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days!: number[];

  @ApiProperty({ example: '08:00' })
  @Matches(TIME_PATTERN)
  start!: string;

  @ApiProperty({ example: '12:00' })
  @Matches(TIME_PATTERN)
  end!: string;
}

export class ListSlaCalendarsQuery {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  activeOnly = true;
}

export class CreateSlaCalendarDto {
  @ApiProperty({ example: 'PADRAO' })
  @IsString()
  @Length(1, 60)
  code!: string;

  @ApiProperty({ example: 'Calendário administrativo' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiPropertyOptional({ example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  timezone?: string;

  @ApiPropertyOptional({ enum: SlaTimeMode, default: SlaTimeMode.CALENDAR })
  @IsOptional()
  @IsEnum(SlaTimeMode)
  timeMode?: SlaTimeMode;

  @ApiPropertyOptional({ type: [Number], example: [1, 2, 3, 4, 5] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  businessDays?: number[];

  @ApiPropertyOptional({
    type: [SlaShiftDto],
    example: [
      { days: [1, 2, 3, 4, 5], start: '08:00', end: '12:00' },
      { days: [1, 2, 3, 4, 5], start: '13:00', end: '17:00' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SlaShiftDto)
  shifts?: SlaShiftDto[];

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  workdayStart?: string;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  workdayEnd?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSlaCalendarDto extends PartialType(CreateSlaCalendarDto) {}

export class CreateSlaHolidayDto {
  @ApiProperty({ example: '2026-09-07' })
  @Matches(DATE_PATTERN)
  date!: string;

  @ApiProperty({ example: 'Independência do Brasil' })
  @IsString()
  @Length(2, 160)
  name!: string;
}

export class ListSlaPoliciesQuery {
  @ApiPropertyOptional({ enum: WorkOrderPriority })
  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  calendarId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  activeOnly = true;
}

export class CreateSlaPolicyDto {
  @ApiProperty()
  @IsUUID()
  calendarId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  contractId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ example: 'ALTA_PADRAO' })
  @IsString()
  @Length(1, 80)
  code!: string;

  @ApiProperty({ example: 'Prioridade alta - padrão do tenant' })
  @IsString()
  @Length(2, 180)
  name!: string;

  @ApiProperty({ enum: WorkOrderPriority })
  @IsEnum(WorkOrderPriority)
  priority!: WorkOrderPriority;

  @ApiProperty({ minimum: 1, example: 240 })
  @IsInt()
  @Min(1)
  @Max(5256000)
  responseMinutes!: number;

  @ApiProperty({ minimum: 1, example: 1440 })
  @IsInt()
  @Min(1)
  @Max(5256000)
  resolutionMinutes!: number;

  @ApiPropertyOptional({ minimum: 0, example: 60, default: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5256000)
  warningMinutesBefore?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSlaPolicyDto extends PartialType(CreateSlaPolicyDto) {}

export class CalculateSlaDto {
  @ApiProperty({ example: '2026-08-03T12:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ enum: WorkOrderPriority })
  @IsEnum(WorkOrderPriority)
  priority!: WorkOrderPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
