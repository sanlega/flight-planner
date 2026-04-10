const BASE = '/api/auth'

export interface AuthUser {
  id: number
  username: string
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `Error ${res.status}`)
  }
  return res.json()
}

export const checkAuth = () => request<AuthUser>('/me')

export const login = (username: string, password: string) =>
  request<AuthUser>('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const register = (username: string, password: string) =>
  request<AuthUser>('/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const logout = () =>
  request<{ ok: boolean }>('/logout', { method: 'POST' })
