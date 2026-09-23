import { IsEnum, IsOptional } from 'class-validator';
import { BaseQueryDto } from '@base/base-query.dto';
import { OrderStatus } from '@shared/pipeline';

/** `GET /orders`: sorted by `created_at` (newest first by default), optionally one status. */
export class ListOrdersQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
