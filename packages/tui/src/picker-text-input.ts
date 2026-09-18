import { previousGraphemeIndex } from './input-graphemes.js';

/** Single-line picker fields accept pasted Unicode but never terminal controls. */
export function pickerInputText(input: string): string {
  return Array.from(input)
    .filter((ch) => !/[\u0000-\u001f\u007f-\u009f]/u.test(ch))
    .join('');
}

export function pickerBackspace(value: string): string {
  return value.slice(0, previousGraphemeIndex(value, value.length));
}
