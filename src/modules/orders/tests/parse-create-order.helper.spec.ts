import { BadRequestException } from '@nestjs/common';
import { parseCreateOrder } from '@modules/orders/helpers/parse-create-order.helper';

describe('parseCreateOrder', () => {
  it('trims the customer name and formats a numeric amount to two decimals', () => {
    expect(parseCreateOrder({ customerName: '  Ada  ', amount: 12.5 })).toEqual({
      customerName: 'Ada',
      amount: '12.50',
    });
  });

  it('accepts the amount as a numeric string, trimmed', () => {
    expect(parseCreateOrder({ customerName: 'Ada', amount: ' 7 ' }).amount).toBe('7.00');
  });

  it('rounds with toFixed(2)', () => {
    expect(parseCreateOrder({ customerName: 'Ada', amount: 1.239 }).amount).toBe('1.24');
  });

  it('accepts zero', () => {
    expect(parseCreateOrder({ customerName: 'Ada', amount: 0 }).amount).toBe('0.00');
  });

  it.each([undefined, '', '   ', 42, null])('rejects customerName %p', (customerName) => {
    expect(() => parseCreateOrder({ customerName, amount: 1 })).toThrow(
      new BadRequestException('customerName is required'),
    );
  });

  it('rejects a missing body without a TypeError', () => {
    expect(() => parseCreateOrder(undefined as never)).toThrow(BadRequestException);
  });

  it.each([undefined, null, true, {}])('rejects a non-number/non-string amount %p', (amount) => {
    expect(() => parseCreateOrder({ customerName: 'Ada', amount })).toThrow(
      new BadRequestException('amount must be a number'),
    );
  });

  it.each(['', '  ', '-1', -0.01, 'abc', '12abc', NaN, Infinity, 'Infinity'])(
    'rejects amount %p',
    (amount) => {
      expect(() => parseCreateOrder({ customerName: 'Ada', amount })).toThrow(
        new BadRequestException('amount must be a non-negative number'),
      );
    },
  );
});
