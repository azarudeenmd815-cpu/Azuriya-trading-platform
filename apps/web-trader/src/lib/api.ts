import type { APIErrorBody } from "@azuriya/api-types";
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"
).replace(/\/$/, "");
export class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "APIError";
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new APIError(
      "CONNECTION_FAILED",
      "Unable to reach the trading server. Check that the backend is running.",
      0,
    );
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      !path.startsWith("/auth/") &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new Event("azuriya:session-expired"));
    }
    const error: APIErrorBody = await response.json().catch(() => ({
      code: "HTTP_ERROR",
      message: `Request failed (${response.status}).`,
    }));
    throw new APIError(
      error.code,
      error.message,
      response.status,
      error.details,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export function post<T>(path: string, body: unknown, key?: string) {
  return api<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: key ? { "Idempotency-Key": key } : {},
  });
}
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}
