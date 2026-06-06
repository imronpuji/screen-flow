const TOKEN_KEY = 'access_token';
const TOKEN_EXPIRY_KEY = 'access_token_expiry';

export function getToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token) return null;
  if (expiry && Date.now() > parseInt(expiry, 10)) {
    clearToken();
    return null;
  }
  return token;
}

export function setToken(token: string, expiresInSeconds = 86400): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresInSeconds * 1000));
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

export function hasValidToken(): boolean {
  return getToken() !== null;
}
