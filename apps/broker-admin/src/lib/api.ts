import type { APIErrorBody } from "@azuriya/api-types";
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");
export class APIError extends Error { constructor(public code: string, message: string, public status: number, public details?: Record<string, unknown>) { super(message); this.name = "APIError"; } }
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
 let response: Response;
 try { response = await fetch(`${API_URL}/api/v1${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } }); } catch { throw new APIError("CONNECTION_FAILED", "Unable to reach the broker server. Check the connection and try again.", 0); }
 if (!response.ok) { if (response.status === 401 && !path.startsWith("/auth/") && typeof window !== "undefined") window.dispatchEvent(new Event("azuriya:admin-session-expired")); const error: APIErrorBody = await response.json().catch(() => ({code:"HTTP_ERROR",message:`Request failed (${response.status}).`})); throw new APIError(error.code,error.message,response.status,error.details); }
 if (response.status === 204) return undefined as T;
 return response.json() as Promise<T>;
}
export function adminApi<T>(path: string, init?: RequestInit) { return api<T>(`/admin${path}`, init); }
export function write<T>(path: string, body: unknown, method = "POST", key?: string) { return adminApi<T>(path, { method, body: JSON.stringify(body), headers: key ? { "Idempotency-Key": key } : {} }); }
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : "An unexpected error occurred."; }
export async function downloadReport(resource: string, filters: URLSearchParams) {
 const query = new URLSearchParams(filters); query.set("format","csv");
 const response = await fetch(`${API_URL}/api/v1/admin/reports/${resource}?${query}`, { credentials:"include" });
 if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.message || `Report failed (${response.status}).`); }
 const href = URL.createObjectURL(await response.blob()); const link=document.createElement("a"); link.href=href; link.download=`azuriya-${resource}.csv`; link.click(); URL.revokeObjectURL(href);
}

