import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Order } from '@shared/order.enum';
import { DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT } from './base.constants';

/**
 * Query params every list endpoint accepts. Feature query DTOs extend it with their own
 * filters, and may redeclare `order` to change the default direction.
 */
export abstract class BaseQueryDto {
  /** Query strings arrive as text, so `@Type` coerces before `@IsInt` checks. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUERY_LIMIT)
  limit: number = DEFAULT_QUERY_LIMIT;

  /** Accepts `asc`/`desc` in any case. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(Order)
  order: Order = Order.Desc;
}
