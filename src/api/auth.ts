import { apiRequest } from './client';
import type { LoginResponse } from './types';

export function login(email: string, password: string) {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
}

export function register(data: {
  full_name: string;
  email: string;
  phone_number: string;
  password: string;
}) {
  return apiRequest<void>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
    skipAuth: true,
  });
}
