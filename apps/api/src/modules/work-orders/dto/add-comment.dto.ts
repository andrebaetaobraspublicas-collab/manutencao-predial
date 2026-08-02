import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class AddCommentDto {
  @ApiProperty({ example: 'Peça recebida; a equipe iniciará a substituição às 14h.' })
  @IsString()
  @Length(1, 10_000)
  body!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  mentionUserIds?: string[];
}
