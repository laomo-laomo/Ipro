export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url) {
    return undefined;
  }

  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem('auth_token');
}

export function authHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  if (!token) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}

export function jsonHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return authHeaders({
    'Content-Type': 'application/json',
    ...headers,
  });
}
