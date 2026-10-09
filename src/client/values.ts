import type { JsonValue, Row } from '../shared/types';

export function str(value: JsonValue | undefined, fallback = '—'): string {
  if (typeof value === 'string') return value || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}
export function object(value: JsonValue | undefined): Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
export function rows(value: JsonValue | undefined): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => item !== null && typeof item === 'object' && !Array.isArray(item)) : [];
}
export function words(value: string): string {
  return value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
export function display(value: JsonValue | undefined): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
export function date(value: JsonValue | undefined): string {
  if (typeof value !== 'string') return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}
