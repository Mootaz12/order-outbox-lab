import { IsEnum, IsOptional } from 'class-validator';
import { BaseQueryDto } from '@base/base-query.dto';
import { StageName } from '@shared/pipeline';

/** `GET /dead-letters`: sorted by `retry_count`, optionally one stage. */
export class ListDeadLettersQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(StageName)
  stage?: StageName;
}
