import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  @Length(32, 200)
  token!: string;

  @ApiPropertyOptional({ description: 'Obrigatório para uma conta ainda não ativada' })
  @IsOptional()
  @IsString()
  @Length(3, 160)
  name?: string;

  @ApiPropertyOptional({ description: 'Obrigatória para uma conta ainda não ativada' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  password?: string;
}
