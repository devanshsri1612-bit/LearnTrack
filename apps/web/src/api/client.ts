import { z } from "zod";
import { ApiErrorShapeSchema, CsrfResponseSchema } from "@learntrack/contracts";

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly endpoint: string;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    endpoint: string;
  }) {
    super(params.message);
    this.name = "ApiClientError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.endpoint = params.endpoint;
  }
}

export class ContractMismatchError extends Error {
  public readonly endpoint: string;
  public readonly issues: z.ZodIssue[];

  constructor(endpoint: string, issues: z.ZodIssue[]) {
    super(`Contract mismatch on ${endpoint}`);
    this.name = "ContractMismatchError";
    this.endpoint = endpoint;
    this.issues = issues;
  }
}

type ClientEventListener = {
  onUnauthorized?: () => void;
  onSyntheticDetected?: () => void;
  onContractMismatch?: (endpoint: string, issues: z.ZodIssue[]) => void;
};

let listeners: ClientEventListener = {};
let cachedCsrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

export function registerApiClientListeners(newListeners: ClientEventListener) {
  listeners = { ...listeners, ...newListeners };
}

export function clearCsrfTokenCache() {
  cachedCsrfToken = null;
  csrfPromise = null;
}

export function isMockModeEnabled(): boolean {
  return import.meta.env.VITE_API_MODE === "mock";
}

async function ensureCsrfToken(): Promise<string | null> {
  if (cachedCsrfToken) return cachedCsrfToken;
  if (csrfPromise) return csrfPromise;

  csrfPromise = (async () => {
    try {
      const res = await fetch("/api/auth/csrf", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const json: unknown = await res.json();
      const parsed = CsrfResponseSchema.safeParse(json);
      if (parsed.success && parsed.data.csrfToken) {
        cachedCsrfToken = parsed.data.csrfToken;
        return cachedCsrfToken;
      }
      return null;
    } catch {
      return null;
    } finally {
      csrfPromise = null;
    }
  })();

  return csrfPromise;
}

export interface ApiRequestOptions<TSchema extends z.ZodTypeAny> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  schema: TSchema;
  idempotencyKey?: string;
  skipUnauthorizedRedirect?: boolean;
}

export async function apiRequest<TSchema extends z.ZodTypeAny>(
  endpoint: string,
  options: ApiRequestOptions<TSchema>
): Promise<z.infer<TSchema>> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  if (method !== "GET") {
    const csrf = await ensureCsrfToken();
    if (csrf) {
      headers["X-CSRF-Token"] = csrf;
    }
  }

  const response = await fetch(endpoint, {
    method,
    credentials: "include",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let errorPayload: unknown = null;
    try {
      errorPayload = await response.json();
    } catch {
      // Non-JSON error body
    }

    const parsedError = ApiErrorShapeSchema.safeParse(errorPayload);
    const code = parsedError.success
      ? parsedError.data.error.code
      : `HTTP_${response.status}`;
    const message = parsedError.success
      ? parsedError.data.error.message
      : response.status === 403
      ? "You do not have access"
      : response.status === 404
      ? "Resource not found"
      : response.status === 409
      ? "Conflict detected"
      : `Request failed with status ${response.status}`;
    const details = parsedError.success
      ? parsedError.data.error.details
      : undefined;

    if (response.status === 401 && !options.skipUnauthorizedRedirect) {
      listeners.onUnauthorized?.();
    }

    throw new ApiClientError({
      status: response.status,
      code,
      message,
      details,
      endpoint,
    });
  }

  const rawData: unknown = await response.json();

  if (
    typeof rawData === "object" &&
    rawData !== null &&
    "synthetic" in rawData &&
    (rawData as { synthetic?: unknown }).synthetic === true
  ) {
    listeners.onSyntheticDetected?.();
  }

  const parsed = options.schema.safeParse(rawData);
  if (!parsed.success) {
    if (import.meta.env.DEV) {
      console.error(
        `[Contract mismatch] Endpoint: ${method} ${endpoint}`,
        parsed.error.issues
      );
    }
    listeners.onContractMismatch?.(
      `${method} ${endpoint}`,
      parsed.error.issues
    );
    throw new ContractMismatchError(
      `${method} ${endpoint}`,
      parsed.error.issues
    );
  }

  return parsed.data;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

