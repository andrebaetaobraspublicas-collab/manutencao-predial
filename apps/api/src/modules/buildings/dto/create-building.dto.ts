import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
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
  type?: string;

  @ApiProperty({ example: 'Praça dos Três Poderes, Bloco A' })
  @IsString()
  addressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Zona Cívico-Administrativa' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ example: 'Brasília' })
  @IsString()
  city!: string;

  @ApiProperty({ example: 'DF' })
  @IsString()
  @Length(2, 2)
  state!: string;

  @ApiProperty({ example: '70100-000' })
  @IsString()
  postalCode!: string;

  @ApiPropertyOptional({ example: -15.7991 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: -47.8645 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

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
