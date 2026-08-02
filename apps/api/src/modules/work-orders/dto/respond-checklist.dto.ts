import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class RespondChecklistDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  checked!: boolean;

  @ApiPropertyOptional({ example: 'Item conferido no local.' })
  @IsOptional()
  @IsString()
  @Length(1, 5_000)
  note?: string;
}
