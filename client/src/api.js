// Cliente HTTP: siempre rutas relativas (/api/...), así funciona igual con el proxy
// de Vite en local y con el rewrite de Vercel en producción.

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Error ${status}`);
    this.status = status;
    this.code = body?.error?.code;
    this.issues = body?.error?.issues;
  }
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};

/** Mensaje legible para la UI a partir de un error de la API. */
export function errorMessage(err) {
  if (err instanceof ApiError && err.issues?.length) {
    return err.issues.map((i) => i.message).join(' · ');
  }
  return err?.message || 'Algo ha fallado';
}
