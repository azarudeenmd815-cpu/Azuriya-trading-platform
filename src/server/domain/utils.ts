import type { JsonValue, Row } from '../../shared/types.js';
import { AppError } from './errors.js';

export function serializable<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function name(value: string, label = 'Name'): string {
  if (!value?.trim() || value.trim().length > 120) throw new AppError(422, 'INVALID_INPUT', `${label} must contain between 1 and 120 characters.`);
  return value.trim();
}
export function safeMetadata(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(safeMetadata);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/(?:secret|password|credential|token|internal_notes|csrf)/i.test(key)).map(([key, field]) => [key, safeMetadata(field)]));
  return value === undefined ? null : value as JsonValue;
}
export function requireRow(rows: Row[]): Row {
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'The requested resource does not exist in this scope.');
  return serializable(rows[0]);
}
export function dbCode(error: unknown): string | undefined { return error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined; }

