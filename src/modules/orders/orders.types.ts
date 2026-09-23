import { OrderStatus } from '../../shared/pipeline';

/** The raw POST /orders body — untrusted, so every field is `unknown`. */
export interface CreateOrderBody {
  customerName?: unknown;
  amount?: unknown;
}

export interface CreateOrderInput {
  customerName: string;
  /** Already rounded to two decimals, ready for the `numeric` column. */
  amount: string;
}

/** The POST /orders response: the new order, before anything downstream has run. */
export interface CreatedOrder {
  id: string;
  customerName: string;
  amount: string;
  status: OrderStatus;
}
