import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { MembershipRole, MembershipStatus } from '../../../generated/prisma/client';

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: MembershipRole })
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;

  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional({ nullable: true, description: 'Validade do acesso provisório' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
