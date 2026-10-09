import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { createHmac, timingSafeEqual } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { AppError } from '../domain/errors.js';
export function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export function webhookUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError(422, 'INVALID_WEBHOOK_URL', 'Use a public HTTPS webhook URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || /(^|\.)localhost\.?$|\.local\.?$/i.test(url.hostname)) throw new AppError(422, 'INVALID_WEBHOOK_URL', 'Use a public HTTPS webhook URL on port 443 without credentials or fragments.');
  return url;
}
export async function resolvePublicWebhook(value: string, resolver = lookup): Promise<{ url: URL; address: string; family: number }> {
  const url = webhookUrl(value);
  let answers: { address: string; family: number }[];
  try { answers = await resolver(url.hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true }); }
  catch { throw new AppError(422, 'WEBHOOK_DNS_FAILED', 'The webhook hostname could not be resolved.'); }
  if (!answers.length || answers.some(answer => !publicAddress(answer.address))) throw new AppError(422, 'WEBHOOK_SSRF_BLOCKED', 'Every resolved webhook address must be public.');
  return { url, ...answers[0] };
}
export function signWebhook(secret: string, timestamp: number, deliveryId: string, body: string): string {
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.${deliveryId}.${body}`).digest('hex')}`;
}
export function verifyWebhook(secret: string, timestamp: number, deliveryId: string, body: string, signature: string, now = Date.now()): boolean {
  if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300 || !/^v1=[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signWebhook(secret, timestamp, deliveryId, body)), Buffer.from(signature));
}
export async function postWebhook(value: string, body: string, headers: Record<string, string>, timeoutMs = 10_000): Promise<{ status: number }> {
  const resolved = await resolvePublicWebhook(value);
  return new Promise((resolve, reject) => {
    // The validated address is pinned for this connection. TLS verifies the original hostname.
    const req = request(resolved.url, { method: 'POST', agent: false, family: resolved.family, timeout: timeoutMs, headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)), ...headers }, lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family) }, response => {
      const status = response.statusCode ?? 0;
      response.resume();
      response.on('end', () => resolve({ status }));
      response.on('error', reject);
    });
    const deadline = setTimeout(() => req.destroy(new Error('WEBHOOK_TIMEOUT')), timeoutMs);
    req.on('timeout', () => req.destroy(new Error('WEBHOOK_TIMEOUT')));
    req.on('error', reject); req.on('close', () => clearTimeout(deadline)); req.end(body);
  });
}
