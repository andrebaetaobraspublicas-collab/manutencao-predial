import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';

export class OrcaproLoginDto {
  @ApiProperty() @IsEmail() @MaxLength(190) email!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(72) password!: string;
}

export class RegisterOrcaproDto extends OrcaproLoginDto {
  @ApiProperty() @IsString() @Length(2, 160) name!: string;
  @ApiProperty({ minLength: 10 }) @IsString() @MinLength(10) @MaxLength(72) declare password: string;
  @ApiProperty() @IsUUID() planId!: string;
}
