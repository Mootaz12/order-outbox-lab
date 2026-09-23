import { BaseQueryDto } from '@base/base-query.dto';
import { Order } from '@shared/order.enum';

/**
 * `GET /orders/:id/stages`: an order's audit rows. Oldest first by default, because the
 * dashboard replays them as a timeline; validation is inherited from BaseQueryDto.
 */
export class ListStageEventsQueryDto extends BaseQueryDto {
  order: Order = Order.Asc;
}
