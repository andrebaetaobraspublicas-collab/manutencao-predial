import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Manutenção Predial Brasil Ltda.' })
  @IsString()
  @Length(2, 200)
  legalName!: string;

  @ApiPropertyOptional({ example: 'MPB Serviços' })
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiProperty({ example: '12.345.678/0001-90' })
  @IsString()
  @Length(8, 24)
  taxId!: string;

  @ApiPropertyOptional({ example: 'contato@fornecedor.com.br' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '(61) 3333-4444' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Maria da Silva' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({ type: [String], example: ['elétrica', 'hidráulica', 'civil'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  serviceAreas?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
