import { BadRequestException } from '@nestjs/common';
import { CreateOrderBody, CreateOrderInput } from './orders.types';

/** Validates the body by hand; throws BadRequestException (400) on the first bad field. */
export function parseCreateOrder(input: CreateOrderBody): CreateOrderInput {
  const customerName =
    typeof input?.customerName === 'string' ? input.customerName.trim() : '';
  if (!customerName) throw new BadRequestException('customerName is required');

  // `Number(null)`, `Number('')` and `Number('  ')` are all 0, so coercion alone would
  // happily accept an order with no amount at all. Check the text as well as the value.
  if (typeof input.amount !== 'number' && typeof input.amount !== 'string') {
    throw new BadRequestException('amount must be a number');
  }
  const text = String(input.amount).trim();
  const amount = Number(text);
  if (!text || !Number.isFinite(amount) || amount < 0) {
    throw new BadRequestException('amount must be a non-negative number');
  }

  return { customerName, amount: amount.toFixed(2) };
}
