import type { WSServerMessage } from '@/types';

export interface SavedProvider {
  id: string;
  type?: string | undefined;
  family?: string | undefined;
  apiKeys: Array<{ label: string; maskedKey: string; isActive: boolean }>;
}

export interface CatalogModel {
  id: string;
  name: string;
  description?: string | undefined;
  contextWindow?: number | undefined;
  maxOutput?: number | undefined;
  inputCost?: number | undefined;
  outputCost?: number | undefined;
  capabilities: string[];
}

export type TestResult = Extract<WSServerMessage, { type: 'provider.test.result' }>['payload'];

export type Step = 'provider' | 'models' | 'results';

export function compactNumber(value: number | undefined): string {
  if (!value) return '—';
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function diagnosisLabel(value: string, t: (key: string) => string): string {
  return t(`activity:providerTest.diagnosis.${value}`);
}

export function matchesModelRef(
  raw: string,
  provider: string,
  model: string,
  defaultProvider: string,
): boolean {
  const clean = raw.trim().toLowerCase();
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedModel = model.trim().toLowerCase();
  return (
    clean === `${normalizedProvider}/${normalizedModel}` ||
    clean === `${normalizedProvider} ${normalizedModel}` ||
    (normalizedProvider === defaultProvider.trim().toLowerCase() && clean === normalizedModel)
  );
}
