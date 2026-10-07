import axios, { AxiosError, AxiosResponse } from "axios";

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

/** Endpoints where a 401 means "bad credentials", not "token expired". */
const AUTH_ENDPOINTS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Every server response is `{ success: true, data }`. Unwrapping it here
 * means callers keep writing `const { data } = await api.get(...)` and get
 * the payload directly.
 */
api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === "object" && body.success === true && "data" in body) {
      response.data = body.data;
    }
    return response;
  },
  async (error: AxiosError) => {
    normalizeError(error);

    const status = error.response?.status;
    const original = error.config as
      | (AxiosError["config"] & { _retry?: boolean })
      | undefined;

    const isAuthPath = AUTH_ENDPOINTS.some((path) => original?.url?.includes(path));

    if (status === 401 && original && !original._retry && !isAuthPath) {
      original._retry = true;

      try {
        const refreshed = await axios.post<ApiSuccessEnvelope<{ accessToken: string }>>(
          `${API_BASE}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        const accessToken = refreshed.data?.data?.accessToken;
        if (!accessToken) throw new Error("Refresh returned no token");

        localStorage.setItem("accessToken", accessToken);
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${accessToken}`;
        onTokenRefreshed?.(accessToken);

        return api(original);
      } catch {
        localStorage.removeItem("accessToken");
        onSessionExpired?.();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

interface NormalizedApiError {
  code?: string;
  apiMessage?: string;
}

/** Attaches `code` / `apiMessage` when the server returned our envelope. */
function normalizeError(error: AxiosError): void {
  const body = error.response?.data as ApiErrorEnvelope | undefined;
  if (body && typeof body === "object" && body.success === false && body.error) {
    const target = error as AxiosError & NormalizedApiError;
    target.code = body.error.code;
    target.apiMessage = body.error.message;
  }
}

export function apiErrorCode(error: unknown): string | undefined {
  return (error as (AxiosError & NormalizedApiError) | undefined)?.code;
}

/** Best human-readable message for any thrown value. */
export function apiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(error)) {
    const normalized = error as AxiosError & NormalizedApiError;
    return normalized.apiMessage || error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

type TokenListener = (accessToken: string) => void;
type SessionListener = () => void;

let onTokenRefreshed: TokenListener | null = null;
let onSessionExpired: SessionListener | null = null;

/** Wired by the auth store so a refresh updates the live socket too. */
export function setAuthListeners(refreshed: TokenListener | null, expired: SessionListener | null): void {
  onTokenRefreshed = refreshed;
  onSessionExpired = expired;
}

export type { AxiosResponse };
export default api;
