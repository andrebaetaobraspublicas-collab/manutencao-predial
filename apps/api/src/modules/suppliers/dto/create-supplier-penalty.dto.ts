import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { PenaltyType } from '../../../generated/prisma/client';

export class CreateSupplierPenaltyDto {
  @ApiPropertyOptional({ description: 'Contrato relacionado, quando houver.' })
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiProperty({ enum: PenaltyType })
  @IsEnum(PenaltyType)
  type!: PenaltyType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  administrativeCase?: string;

  @ApiProperty()
  @IsString()
  @Length(3, 10000)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiProperty()
  @IsDateString()
  appliedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
