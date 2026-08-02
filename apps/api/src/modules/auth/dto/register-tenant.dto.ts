import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @ApiProperty({ example: 'Secretaria de Administração' })
  @IsString()
  @Length(3, 160)
  tenantName!: string;

  @ApiProperty({ example: 'secretaria-administracao' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'tenantSlug deve conter apenas letras minúsculas, números e hífens.',
  })
  @Length(3, 100)
  tenantSlug!: string;

  @ApiProperty({ example: 'Administrador Geral' })
  @IsString()
  @Length(3, 160)
  ownerName!: string;

  @ApiProperty({ example: 'admin@empresa.com.br' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'UmaSenhaForte!2026' })
  @IsString()
  @MinLength(10)
  password!: string;
}
