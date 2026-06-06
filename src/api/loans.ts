import { apiRequest } from './client';
import type { Loan } from './types';

export function getActiveLoan() {
  return apiRequest<Loan | null>('/api/loans/active');
}

export function getLoan(id: string) {
  return apiRequest<Loan>(`/api/loans/${id}`);
}

export function createLoan(data: { amount: number; tenor_month: number; purpose: string }) {
  return apiRequest<Loan>('/api/loans', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
