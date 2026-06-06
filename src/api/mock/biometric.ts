import { createToken, loadDb } from './store';

const BIOMETRIC_KEY = 'loanapp_biometric_enabled';
const BIOMETRIC_USER_KEY = 'loanapp_biometric_user';

export function isBiometricEnabled(): boolean {
  return localStorage.getItem(BIOMETRIC_KEY) === 'true';
}

export function enableBiometric(userId: string): void {
  localStorage.setItem(BIOMETRIC_KEY, 'true');
  localStorage.setItem(BIOMETRIC_USER_KEY, userId);
}

export function disableBiometric(): void {
  localStorage.removeItem(BIOMETRIC_KEY);
  localStorage.removeItem(BIOMETRIC_USER_KEY);
}

export function enrollFromToken(token: string): void {
  const parts = token.split('.');
  if (parts[0] === 'mock' && parts[1]) enableBiometric(parts[1]);
}

/** Simulates fingerprint / Face ID scan (~1.5s) */
export async function mockBiometricLogin(): Promise<{ access_token: string }> {
  await new Promise((r) => setTimeout(r, 1500));

  if (!isBiometricEnabled()) {
    throw new Error('Biometric not enrolled. Login with password first.');
  }

  const userId = localStorage.getItem(BIOMETRIC_USER_KEY);
  const db = loadDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    disableBiometric();
    throw new Error('Biometric enrollment expired. Login with password.');
  }

  return { access_token: createToken(user.id) };
}

/** Quick demo biometric without prior enrollment */
export async function mockBiometricLoginDemo(): Promise<{ access_token: string }> {
  await new Promise((r) => setTimeout(r, 1500));
  const db = loadDb();
  const user = db.users.find((u) => u.email === 'demo@loanapp.com') ?? db.users[0];
  if (!user) throw new Error('No demo user found');
  enableBiometric(user.id);
  return { access_token: createToken(user.id) };
}
