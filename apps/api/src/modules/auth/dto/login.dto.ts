import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'demonstracao' })
  @IsString()
  @Length(3, 100)
  tenantSlug!: string;

  @ApiProperty({ example: 'admin@gestaodepredios.com.br' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Con2026!Demo' })
  @IsString()
  password!: string;
}
