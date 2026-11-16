import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { AdminListQuery, AuditListQuery } from '../orcapro/orcapro.dto';
import { CreateSaasUserDto, SaasPlanDto } from '../orcapro/orcapro-saas.dto';

export class GcUserQuery extends AdminListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) search = '';
  @ApiPropertyOptional() @IsOptional() @IsIn(['ALL','ACTIVE','SUSPENDED','DELETED']) status = 'ALL';
}
export class GcAuditQuery extends AuditListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) entity?: string;
}
export class GcCreateUserDto extends CreateSaasUserDto {}
export class GcVersionDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
export class GcGrantDto {
  @ApiProperty({description:'Vínculo da identidade central previamente listado; o tenant é resolvido pelo servidor.'}) @IsUUID() membershipId!: string;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
export class GcUserAccessDto extends GcVersionDto {
  @ApiProperty() @IsIn(['ACTIVE','SUSPENDED','DELETED']) status!: 'ACTIVE'|'SUSPENDED'|'DELETED';
  @ApiProperty() @IsIn(['USER','ADMIN']) role!: 'USER'|'ADMIN';
}
export class GcPasswordDto extends GcVersionDto {
  @ApiProperty({minLength:10,writeOnly:true}) @IsString() @MinLength(10) @MaxLength(72) newPassword!: string;
  @ApiProperty({description:'Confirma que a senha e as sessões são compartilhadas pelos produtos.'}) @IsBoolean() acknowledgeShared!: boolean;
}
export class GcSubscriptionDto extends GcVersionDto {
  @ApiProperty() @IsIn(['MANUAL','STRIPE']) billingSource!: 'MANUAL'|'STRIPE';
  @ApiProperty() @IsIn(['ACTIVE','TRIALING','MANUAL_CONTRACT','PAST_DUE','CANCELED','UNPAID']) status!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601({strict:true}) currentPeriodEnd?: string;
}
export class GcPlanDto extends SaasPlanDto {}
export class GcStripeActionDto extends GcVersionDto {
  @ApiProperty() @IsIn(['SYNC','CANCEL_AT_PERIOD_END','RESUME']) action!: 'SYNC'|'CANCEL_AT_PERIOD_END'|'RESUME';
  @ApiProperty() @IsUUID() requestId!: string;
}
export class GcSettingDto extends GcVersionDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(160) title!: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(40000) body!: string;
  @ApiProperty() @IsBoolean() published!: boolean;
}
export class GcNavigationDto {
  @ApiProperty() @IsIn(['items','measurements','amendments','prices','discount','planning','documents','subscription','manual','saas','account']) screen!: string;
}
