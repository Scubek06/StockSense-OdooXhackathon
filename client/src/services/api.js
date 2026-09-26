const BASE = import.meta.env.VITE_API_URL || '';

export async function request(path, options = {}) {
  const token = localStorage.getItem('stocksense-token');
  const response = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || data?.message || 'Request failed. Please try again.');
  return data;
}

export const listOf = (value) => Array.isArray(value) ? value : value?.items || value?.data || [];
