import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({ example: 'PRO_MONTHLY' })
  @IsString()
  @Length(2, 50)
  planCode!: string;
}
