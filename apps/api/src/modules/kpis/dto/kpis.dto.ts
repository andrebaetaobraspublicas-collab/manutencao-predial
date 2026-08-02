import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CalculateKpisDto {
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsUUID() buildingId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
}

export class KpiTrendQuery {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(36)
  periods = 12;
}

