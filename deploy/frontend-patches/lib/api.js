const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:4000/api";

export class ApiError extends Error {
  constructor(message, { status, errors, payload } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? 500;
    this.errors = errors ?? [];
    this.payload = payload ?? null;
  }
}

export async function apiRequest(path, options = {}) {
  const {
    method = "GET",
    body,
    token,
    headers: customHeaders = {},
  } = options;

  const headers = {
    Accept: "application/json",
    ...customHeaders,
  };

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "ارتباط با سرور برقرار نشد. آدرس API را در NEXT_PUBLIC_API_URL بررسی کنید.",
      { status: 0 }
    );
  }

  if (options.rawResponse) {
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(payload?.message || "درخواست با خطا مواجه شد.", {
        status: response.status,
        errors: payload?.errors || [],
        payload,
      });
    }
    return response;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(payload?.message || "درخواست با خطا مواجه شد.", {
      status: response.status,
      errors: payload?.errors || [],
      payload,
    });
  }

  return payload;
}

export function getApiUrl() {
  return API_URL;
}

/** Resolve a backend-relative media path (e.g. /uploads/avatars/…) to an absolute URL. */
export function getMediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const origin = API_URL.replace(/\/api\/?$/, "");
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
