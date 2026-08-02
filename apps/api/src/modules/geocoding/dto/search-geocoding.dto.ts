import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class SearchGeocodingDto {
  @ApiProperty({ example: 'Praça dos Três Poderes, Bloco A' })
  @IsString()
  @Length(2, 220)
  addressLine1!: string;

  @ApiPropertyOptional({ example: 'Anexo I' })
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
  country?: string;
}
