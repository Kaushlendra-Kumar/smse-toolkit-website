/** Thin client for this site's Route Handlers under src/app/api (Materials Project, citations). */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join("; ");
  } catch {
    if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504)
      message = "The server could not complete the request. Please try again in a moment.";
  }
  throw new ApiError(message, res.status);
}

export function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const q = qs.toString();
  return fetch(`/api${path}${q ? `?${q}` : ""}`).then(handle<T>);
}

export function apiPost<T>(path: string, body: unknown) {
  return fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle<T>);
}

export function apiUpload<T>(path: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return fetch(`/api${path}`, { method: "POST", body: form }).then(handle<T>);
}
