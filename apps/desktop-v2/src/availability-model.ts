import type { ModelBlackoutRule } from '@wrongstack/contracts/types/model-availability';
export const scheduleDays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
export function scheduleMinute(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h! * 60 + m!;
}
export function availabilityIssue(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  for (const [index, item] of value.entries()) {
    const rule = item as ModelBlackoutRule,
      label = rule.label?.trim() || 'Window ' + (index + 1);
    if (!rule.id || ids.has(rule.id)) return label + ': use a unique window identifier.';
    ids.add(rule.id);
    if (!rule.provider?.trim() && !rule.model?.trim())
      return label + ': choose a provider or model target.';
    if (scheduleMinute(rule.start) === null || scheduleMinute(rule.end) === null)
      return label + ': enter times in HH:mm format.';
    if (
      rule.days?.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
      new Set(rule.days).size !== (rule.days?.length ?? 0)
    )
      return label + ': choose valid weekdays.';
    if (rule.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: rule.timezone }).format(new Date());
      } catch {
        return label + ': use an IANA timezone such as Europe/Kyiv or UTC.';
      }
    }
  }
  return null;
}
/** Local wall-clock preview only. Runtime eligibility remains owned by the engine. */
export function scheduleSegments(rule: ModelBlackoutRule, day: number): [number, number][] {
  const start = scheduleMinute(rule.start),
    end = scheduleMinute(rule.end);
  if (start === null || end === null) return [];
  const selected = (value: number) => !rule.days?.length || rule.days.includes(value);
  if (start === end) return selected(day) ? [[0, 1440]] : [];
  if (start < end) return selected(day) ? [[start, end]] : [];
  return [
    ...(selected(day) ? [[start, 1440] as [number, number]] : []),
    ...(selected((day + 6) % 7) && end > 0 ? [[0, end] as [number, number]] : []),
  ];
}
