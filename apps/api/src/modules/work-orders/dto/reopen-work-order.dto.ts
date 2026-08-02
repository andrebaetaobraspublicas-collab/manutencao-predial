import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ReopenWorkOrderDto {
  @ApiProperty({ example: 'O vazamento reapareceu no mesmo ponto após a vistoria.' })
  @IsString()
  @Length(10, 5_000)
  reason!: string;
}
