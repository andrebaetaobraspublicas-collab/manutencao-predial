import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { AdminListQuery } from './orcapro.dto';

export class SaasListQuery extends AdminListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) search = '';
  @ApiPropertyOptional() @IsOptional() @IsIn(['true', 'false']) deleted = 'false';
}
export class CreateSaasUserDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @ApiProperty() @IsEmail() @MaxLength(190) email!: string;
  @ApiProperty({ minLength: 10 }) @IsString() @MinLength(10) @MaxLength(72) password!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(160) organizationName?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[a-z0-9][a-z0-9-]{2,99}$/) organizationSlug?: string;
}
export class SaasPasswordDto {
  @ApiProperty({ minLength: 10 }) @IsString() @MinLength(10) @MaxLength(72) newPassword!: string;
}
export class SaasUserStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'DELETED'] }) @IsIn(['ACTIVE', 'SUSPENDED', 'DELETED']) status!: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
}
export class SaasPlanDto {
  @ApiProperty() @Matches(/^[A-Z0-9][A-Z0-9_-]{1,49}$/) code!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @ApiProperty({ enum: ['MONTH', 'YEAR'] }) @IsIn(['MONTH', 'YEAR']) billingInterval!: 'MONTH' | 'YEAR';
  @ApiProperty({ description: 'Valor decimal em reais, sem separador de milhar.' }) @Matches(/^\d{1,10}(\.\d{1,2})?$/) priceBrl!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^price_[A-Za-z0-9]+$/) stripePriceId?: string;
  @ApiProperty() @IsBoolean() active!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) expectedVersion?: number;
}
export class SaasSubscriptionDto {
  @ApiProperty({ enum: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'UNPAID', 'MANUAL_CONTRACT'] }) @IsIn(['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'UNPAID', 'MANUAL_CONTRACT']) status!: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'UNPAID' | 'MANUAL_CONTRACT';
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true }) currentPeriodEnd?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) expectedVersion?: number;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
export class SaasCheckoutDto {
  @ApiProperty() @IsUUID() planId!: string;
}
export class SaasStripeActionDto {
  @ApiProperty({ enum: ['SYNC', 'CANCEL_AT_PERIOD_END', 'RESUME'] }) @IsIn(['SYNC', 'CANCEL_AT_PERIOD_END', 'RESUME']) action!: 'SYNC' | 'CANCEL_AT_PERIOD_END' | 'RESUME';
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}
