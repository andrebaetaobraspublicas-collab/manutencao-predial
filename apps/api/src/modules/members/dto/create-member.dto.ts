import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MembershipRole } from '../../../generated/prisma/client';

export class CreateMemberDto {
  @ApiProperty({ example: 'Maria da Silva' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: 'maria@empresa.com.br' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 10, description: 'Senha inicial definida pelo administrador.' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: MembershipRole })
  @IsEnum(MembershipRole)
  role!: MembershipRole;

  @ApiPropertyOptional({ description: 'Validade opcional do acesso em ISO 8601.' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
