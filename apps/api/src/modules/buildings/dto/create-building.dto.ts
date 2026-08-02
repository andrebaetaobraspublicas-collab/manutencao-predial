import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBuildingDto {
  @ApiProperty({ example: 'EDF-001' })
  @IsString()
  @Length(1, 40)
  code!: string;

  @ApiProperty({ example: 'Edifício-Sede' })
  @IsString()
  @Length(2, 180)
  name!: string;

  @ApiPropertyOptional({ example: 'Edifício administrativo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  type?: string;

  @ApiProperty({ example: 'Praça dos Três Poderes, Bloco A' })
  @IsString()
  @Length(2, 220)
  addressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Zona Cívico-Administrativa' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @ApiProperty({ example: 'Brasília' })
  @IsString()
  @Length(2, 120)
  city!: string;

  @ApiProperty({ example: 'DF' })
  @IsString()
  @Length(2, 2)
  state!: string;

  @ApiProperty({ example: '70100-000' })
  @IsString()
  @Length(3, 12)
  postalCode!: string;

  @ApiPropertyOptional({ example: 'BR', default: 'BR' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/)
  country?: string;

  @ApiPropertyOptional({ example: -15.7991 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: -47.8645 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Confirma que o usuário validou ou ajustou o marcador exibido no mapa.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  geocodingConfirmed?: boolean;

  @ApiPropertyOptional({ example: 'nominatim' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  geocodingProvider?: string;

  @ApiPropertyOptional({ example: 'building' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  geocodingAccuracy?: string;

  @ApiPropertyOptional({ example: '123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(190)
  geocodingPlaceId?: string;

  @ApiPropertyOptional({
    description: 'Identificador opaco retornado por POST /geocoding/search.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  geocodingLookupId?: string;

  @ApiPropertyOptional({
    description: 'Identificador opaco do candidato retornado pela consulta de geocodificação.',
    minLength: 64,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @Length(64, 64)
  geocodingCandidateId?: string;

  @ApiPropertyOptional({
    enum: ['PROVIDER', 'ADJUSTED', 'MANUAL'],
    description: 'Origem declarada; o servidor valida e determina a origem efetiva.',
  })
  @IsOptional()
  @IsIn(['PROVIDER', 'ADJUSTED', 'MANUAL'])
  geocodingSource?: 'PROVIDER' | 'ADJUSTED' | 'MANUAL';

  @ApiPropertyOptional({ example: 12500 })
  @IsOptional()
  @IsPositive()
  grossAreaM2?: number;

  @ApiPropertyOptional({ example: 1998 })
  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(2200)
  constructionYear?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  floors?: number;
}
