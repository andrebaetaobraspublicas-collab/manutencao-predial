import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ResolvePendencyDto {
  @ApiProperty({ example: 'Peça recebida e instalada.' })
  @IsString()
  @Length(3, 5000)
  resolution!: string;
}
