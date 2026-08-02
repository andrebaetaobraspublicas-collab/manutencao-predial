import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, Length } from 'class-validator';

export class CloseWorkOrderDto {
  @ApiPropertyOptional({ example: 1850.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  finalCost?: number;

  @ApiProperty({
    description: 'Indica que a OS está apta a compor uma medição contratual.',
    example: false,
  })
  @IsBoolean()
  measurementEligible!: boolean;

  @ApiPropertyOptional({ example: 'Serviço conferido e aceito em vistoria.' })
  @IsOptional()
  @IsString()
  @Length(3, 5_000)
  acceptanceNote?: string;
}
