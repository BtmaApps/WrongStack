import type { JSONSchema } from '@wrongstack/contracts/types';

export type KitSchema = JSONSchema;
export function kitInitialValue(schema: KitSchema): unknown {
  if (Object.hasOwn(schema, 'default')) return structuredClone(schema.default);
  if (schema.enum?.length) return structuredClone(schema.enum[0]);
  switch (schema.type) {
    case 'object':
      return Object.fromEntries(
        Object.entries(schema.properties ?? {})
          .filter(
            ([name, child]) => schema.required?.includes(name) || Object.hasOwn(child, 'default'),
          )
          .map(([name, child]) => [name, kitInitialValue(child)]),
      );
    case 'array':
      return [];
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'number':
      return schema.minimum ?? 0;
    case 'integer':
      return Math.ceil(schema.minimum ?? 0);
    default:
      return '';
  }
}

/** Form feedback for the supported kit schema subset; the engine remains authoritative. */
export function kitInputErrors(schema: KitSchema, value: unknown, path = 'Input'): string[] {
  const errors: string[] = [];
  if (schema.enum && !schema.enum.some((item) => kitValuesEqual(item, value)))
    errors.push(`${path}: choose a listed value.`);
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return [`${path}: expected an object.`];
      const object = value as Record<string, unknown>;
      for (const name of schema.required ?? [])
        if (!Object.hasOwn(object, name)) errors.push(`${path}.${name}: required.`);
      for (const [name, item] of Object.entries(object)) {
        const child = Object.hasOwn(schema.properties ?? {}, name)
          ? schema.properties?.[name]
          : undefined;
        if (child) errors.push(...kitInputErrors(child, item, `${path}.${name}`));
        else errors.push(`${path}.${name}: unknown parameter.`);
      }
      break;
    }
    case 'array':
      if (!Array.isArray(value)) return [`${path}: expected a list.`];
      if (schema.minItems !== undefined && value.length < schema.minItems)
        errors.push(`${path}: at least ${schema.minItems} items.`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems)
        errors.push(`${path}: at most ${schema.maxItems} items.`);
      if (schema.items)
        value.forEach((item, i) => {
          errors.push(...kitInputErrors(schema.items as KitSchema, item, `${path}[${i + 1}]`));
        });
      break;
    case 'number':
    case 'integer':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (schema.type === 'integer' && !Number.isInteger(value))
      )
        return [`${path}: enter a finite ${schema.type}.`];
      if (schema.minimum !== undefined && value < schema.minimum)
        errors.push(`${path}: minimum ${schema.minimum}.`);
      if (schema.maximum !== undefined && value > schema.maximum)
        errors.push(`${path}: maximum ${schema.maximum}.`);
      break;
    case 'string':
      if (typeof value !== 'string') return [`${path}: expected text.`];
      if (schema.minLength !== undefined && value.length < schema.minLength)
        errors.push(`${path}: at least ${schema.minLength} characters.`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength)
        errors.push(`${path}: at most ${schema.maxLength} characters.`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: choose yes or no.`);
      break;
    case 'null':
      if (value !== null) errors.push(`${path}: expected an empty value.`);
      break;
    default:
      errors.push(`${path}: unsupported parameter type.`);
  }
  return errors;
}

export function kitValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left))
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => kitValuesEqual(item, right[index]))
    );
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(right)
  )
    return false;
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => Object.hasOwn(b, key) && kitValuesEqual(a[key], b[key]))
  );
}

export function kitRequest(
  name: string,
  revision: string,
  action: 'verify' | 'run',
  input: unknown,
): string {
  if (
    !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(name) ||
    name.length > 80 ||
    !/^[a-f0-9]{64}$/.test(revision)
  )
    throw Error('Refresh the kit before preparing a request.');
  return `Use project_kit_run with the following parameters. Inspect the kit and follow the normal permission flow before executing. Do not substitute a different revision.\n\n${JSON.stringify({ action, name, revision, ...(action === 'run' ? { input } : {}) }, null, 2)}`;
}
