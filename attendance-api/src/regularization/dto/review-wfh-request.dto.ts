import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewWfhRequestDto {
  @ApiPropertyOptional({ example: 'Approved for project delivery' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  review_note?: string;
}
