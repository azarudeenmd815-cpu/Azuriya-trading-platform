import { AppError } from '../domain/errors.js';

/** Deliberately bounded presentment currencies. Account availability remains provider-owned. */
export const stripeCurrencies = Object.freeze({USD:2,EUR:2,GBP:2,CAD:2,AUD:2,CHF:2,JPY:0} as const);
export type StripeCurrency = keyof typeof stripeCurrencies;
function exponent(currency:string):number {
  if(!Object.hasOwn(stripeCurrencies,currency))throw new AppError(422,'PAYMENT_CURRENCY_UNSUPPORTED','This connector does not accept this currency.');
  return stripeCurrencies[currency as StripeCurrency];
}
export function stripeMinorUnits(amount:string,currency:string):string {
  const digits=exponent(currency);
  if(typeof amount!=='string'||!/^(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?$/.test(amount))throw new AppError(422,'PAYMENT_AMOUNT_INVALID','Provide an exact positive decimal amount.');
  const [whole,fraction='']=amount.split('.');
  if(/[1-9]/.test(fraction.slice(digits)))throw new AppError(422,'PAYMENT_PRECISION_UNSUPPORTED','The amount has precision this payment currency cannot represent.');
  const minor=BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.slice(0,digits).padEnd(digits,'0')||'0');
  // A conservative limit compatible with the documented eight-digit PaymentIntent amount.
  if(minor<=0n||minor>99999999n)throw new AppError(422,'PAYMENT_AMOUNT_INVALID','The amount exceeds the supported payment range.');
  return minor.toString();
}
export function stripeInteger(value:unknown,allowNegative=false):bigint {
  if(typeof value==='number'&&!Number.isSafeInteger(value))throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The provider returned an invalid monetary integer.');
  if((typeof value!=='number'&&typeof value!=='string')||!new RegExp(allowNegative?'^-?\\d+$':'^\\d+$').test(String(value)))throw new AppError(502,'PAYMENT_RESPONSE_INVALID','The provider returned an invalid monetary integer.');
  return BigInt(String(value));
}
export function stripeMajorUnits(value:unknown,currency:string,allowNegative=false):string {
  const digits=exponent(currency);const integer=stripeInteger(value,allowNegative);
  const absolute=integer<0n?-integer:integer;const scale=10n**BigInt(digits);
  const fraction=(absolute%scale).toString().padStart(digits,'0').padEnd(8,'0');
  return `${integer<0n?'-':''}${absolute/scale}.${fraction}`;
}
