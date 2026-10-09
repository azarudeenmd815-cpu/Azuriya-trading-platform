import { resolveTxt } from 'node:dns/promises';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { AppError } from './errors.js';

export interface DnsVerifier { resolveTxt(hostname: string): Promise<string[][]> }
export const systemDns: DnsVerifier = { resolveTxt };
export function normalizeHostname(hostname: string): string {
  const raw = hostname.trim().replace(/\.$/, '').toLowerCase();
  const normalized = domainToASCII(raw);
  const labels = normalized.split('.');
  if (/[\s:/?#%@[\]*_\\]/u.test(raw) || !normalized || normalized.length > 253 || labels.length < 2 || isIP(normalized) || !/^[a-z0-9.-]+$/.test(normalized) || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || !/[a-z]/.test(labels.at(-1)!)) {
    throw new AppError(422, 'INVALID_HOSTNAME', 'Provide a DNS hostname without a scheme, port, path, wildcard, or IP address.');
  }
  return normalized;
}
export function verificationRecord(hostname: string, token: string): { type: 'TXT'; name: string; value: string } {
  return { type: 'TXT', name: `_azuriya.${hostname}`, value: `azuriya-verification=${token}` };
}
