import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsEnum, IsOptional } from 'class-validator';
import { MembershipRole } from '../../../generated/prisma/client';

export class InviteMemberDto {
  @ApiProperty({ example: 'operador@empresa.com.br' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.OPERATOR })
  @IsEnum(MembershipRole)
  role!: MembershipRole;

  @ApiPropertyOptional({ description: 'Validade do acesso provisório em ISO 8601' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
