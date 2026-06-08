const BASE = '';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('No autorizado');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: <T = unknown>(url: string) => request<T>(url),
  post: <T = unknown>(url: string, data: unknown) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(data) }),
  put: <T = unknown>(url: string, data: unknown) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(data) }),
  patch: <T = unknown>(url: string, data: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T = unknown>(url: string) => request<T>(url, { method: 'DELETE' }),
};
