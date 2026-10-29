import assert from 'node:assert/strict';
import { parseCsv } from './src/csv.js';

// HARD_SENTINEL_csv-parser

// Basics and record separators.
assert.deepEqual(parseCsv(''), []);
assert.deepEqual(parseCsv('a,b,c'), [['a', 'b', 'c']]);
assert.deepEqual(parseCsv('a,b\r\nc,d\r\n'), [
  ['a', 'b'],
  ['c', 'd'],
]);
assert.deepEqual(parseCsv('a,b\nc,d\n'), [
  ['a', 'b'],
  ['c', 'd'],
]);
// Only ONE trailing line break is ignored; blank lines in the middle are records with one empty field.
assert.deepEqual(parseCsv('a\n\nb'), [['a'], [''], ['b']]);
assert.deepEqual(parseCsv('a\n\n'), [['a'], ['']]);
// Empty fields, including trailing.
assert.deepEqual(parseCsv('a,,b,'), [['a', '', 'b', '']]);
assert.deepEqual(parseCsv(','), [['', '']]);
// Lone CR is ordinary data.
assert.deepEqual(parseCsv('a\rb,c'), [['a\rb', 'c']]);

// Quoting.
assert.deepEqual(parseCsv('"a,b",c'), [['a,b', 'c']]);
assert.deepEqual(parseCsv('"say ""hi""",x'), [['say "hi"', 'x']]);
assert.deepEqual(parseCsv('"",x'), [['', 'x']]);
assert.deepEqual(parseCsv('""""'), [['"']]);
// Line breaks inside quotes are kept verbatim, including CRLF.
assert.deepEqual(parseCsv('"line1\r\nline2",z\r\nnext,row'), [
  ['line1\r\nline2', 'z'],
  ['next', 'row'],
]);
// A quote not at the start of a field is literal; whitespace is never trimmed.
assert.deepEqual(parseCsv('ab"c, "d"'), [['ab"c', ' "d"']]);

// Errors.
assert.throws(() => parseCsv('"abc'), SyntaxError);
assert.throws(() => parseCsv('a,"b"c'), SyntaxError);
assert.throws(() => parseCsv('"a" ,b'), SyntaxError);

// Custom delimiter.
assert.deepEqual(parseCsv('a;"b;c";d', { delimiter: ';' }), [['a', 'b;c', 'd']]);
assert.deepEqual(parseCsv('a,b;c', { delimiter: ';' }), [['a,b', 'c']]);

// Header mode.
assert.deepEqual(parseCsv('name,qty\r\n"Widget, large",3\r\nGadget,\r\n', { header: true }), [
  { name: 'Widget, large', qty: '3' },
  { name: 'Gadget', qty: '' },
]);
assert.deepEqual(parseCsv('a,b', { header: true }), []);
assert.deepEqual(parseCsv('', { header: true }), []);
assert.throws(
  () => parseCsv('a,b\n1,2\n3\n4,5', { header: true }),
  (err) => err instanceof RangeError && /record 2(?!\d)/.test(err.message),
);
assert.throws(() => parseCsv('id,id\n1,2', { header: true }), Error);
const proto = parseCsv('__proto__,x\n1,2', { header: true });
assert.equal(Object.getPrototypeOf(proto[0]), Object.prototype);
assert.deepEqual(Object.keys(proto[0]), ['__proto__', 'x']);
assert.equal(proto[0].x, '2');

console.log('csv-parser: all assertions passed');
