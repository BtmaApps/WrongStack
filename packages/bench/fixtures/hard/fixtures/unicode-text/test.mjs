import assert from 'node:assert/strict';
import { charLength, chars, isAttachedMark } from './src/chars.js';
import { reverse, truncate, wrap } from './src/text.js';

// HARD_SENTINEL_unicode-text

// chars.js
assert.equal(charLength('a😀b'), 3);
assert.equal(charLength('\uD83D'), 1, 'a lone surrogate is one character');
assert.deepEqual(chars('😀x'), ['😀', 'x']);
assert.deepEqual(chars('\uD83Dx\uDE00'), ['\uD83D', 'x', '\uDE00']);
assert.equal(isAttachedMark('́'), true);
assert.equal(isAttachedMark('ͯ'), true);
assert.equal(isAttachedMark('̀'), true);
assert.equal(isAttachedMark('Ͱ'), false);
assert.equal(isAttachedMark('️'), true);
assert.equal(isAttachedMark('︎'), true);
assert.equal(isAttachedMark('\u{1F3FB}'), true);
assert.equal(isAttachedMark('\u{1F3FF}'), true);
assert.equal(isAttachedMark('\u{1F400}'), false);
assert.equal(isAttachedMark('😀'), false);
assert.equal(isAttachedMark('a'), false);

// truncate
assert.equal(truncate('hello', 5), 'hello');
assert.equal(truncate('hello world', 8), 'hello w…');
assert.equal(truncate('😀😀😀😀', 3), '😀😀…');
assert.equal(truncate('😀😀😀', 3), '😀😀😀');
assert.equal(truncate('ab😀cd', 4), 'ab😀…');
assert.equal(truncate('abcdef', 4, '...'), 'a...');
assert.equal(truncate('abcdef', 3, '👉👉'), 'a👉👉');
assert.equal(truncate('abcd', 2, ''), 'ab');
assert.equal(truncate('abcdef', 3, '...'), '...');
assert.throws(() => truncate('abcdef', 2, '...'), RangeError);
assert.throws(() => truncate('😀😀😀', 1, '👉👉'), RangeError);
// Input that already fits is returned unchanged even when the ellipsis would not fit.
assert.equal(truncate('ab', 2, '...'), 'ab');

// reverse
assert.equal(reverse('abc'), 'cba');
assert.equal(reverse('a😀b'), 'b😀a');
assert.equal(reverse('éx'), 'xé');
assert.equal(reverse('aͯb'), 'baͯ');
assert.equal(reverse('👍\u{1F3FD}!'), '!👍\u{1F3FD}');
assert.equal(reverse('❤️1'), '1❤️');
assert.equal(reverse('́̂ab'), 'bá̂');
assert.equal(reverse(''), '');

// wrap
assert.deepEqual(wrap('the quick brown fox', 10), ['the quick', 'brown fox']);
assert.deepEqual(wrap('aaaa bbbbb', 10), ['aaaa bbbbb'], 'a line of exactly `width` fits');
assert.deepEqual(wrap('  a\tb\n\nc  ', 3), ['a b', 'c']);
assert.deepEqual(wrap('abcdefghij xy', 5), ['abcde', 'fghij', 'xy']);
assert.deepEqual(wrap('ab abcdefg h', 3), ['ab', 'abc', 'def', 'g h']);
assert.deepEqual(wrap('😀😀😀 😀', 3), ['😀😀😀', '😀']);
assert.deepEqual(wrap('😀😀😀😀😀 a', 2), ['😀😀', '😀😀', '😀', 'a']);
assert.deepEqual(wrap('', 5), []);
assert.deepEqual(wrap(' \t ', 5), []);
assert.throws(() => wrap('x', 0), RangeError);
assert.throws(() => wrap('x', 2.5), RangeError);

console.log('unicode-text: all assertions passed');
