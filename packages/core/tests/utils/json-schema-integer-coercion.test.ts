import { expect, it } from 'vitest';
import { coerceAgainstSchema } from '../../src/utils/json-schema-validate.js';

it.each(['9007199254740993', '-9007199254740993', '9.007199254740993e15'])(
  'leaves unsafe integer coercion %s for validation instead of rounding it',
  (value) => {
    expect(coerceAgainstSchema(value, { type: 'integer' })).toEqual({ value, changed: false });
  },
);

it.each(['9007199254740991', '-9007199254740991', '42', '1e3'])(
  'keeps safe integer coercion %s',
  (value) => {
    expect(coerceAgainstSchema(value, { type: 'integer' })).toEqual({
      value: Number(value),
      changed: true,
    });
  },
);
