const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;
export function decimal(value: string | undefined | null, digits = 2, group = true): string {
 if (value == null || value === "") return "—"; const match = DECIMAL.exec(value); if (!match) return "—";
 const [, sign, whole, fraction=""] = match; const units=BigInt(whole+fraction.padEnd(digits+1,"0").slice(0,digits)); const rounded=units+(fraction.length>digits && fraction.charCodeAt(digits)>=53 ? 1n : 0n); const result=rounded.toString().padStart(digits+1,"0"); const integer=digits?result.slice(0,-digits):result; return `${sign && rounded>0n?"-":""}${group?integer.replace(/\B(?=(\d{3})+(?!\d))/g,","):integer}${digits?"."+result.slice(-digits):""}`;
}
export function money(value?: string | null, currency = "USD") { const result=decimal(value); return result==="—"?result:`${currency==="USD"?"$":currency+" "}${result}`; }
export function time(value?: string) { return value ? new Date(value).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:false}) : "—"; }
export function label(value: unknown) { return String(value ?? "—").replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()); }
export function sign(value?: string) { return !value || !/[1-9]/.test(value) ? "" : value.startsWith("-") ? "negative" : "positive"; }

