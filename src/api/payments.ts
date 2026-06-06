import { apiRequest } from './client';
import type { Payment } from './types';

export function createPayment(installment_id: string, payment_method: string) {
  return apiRequest<Payment>('/api/payments', {
    method: 'POST',
    body: JSON.stringify({ installment_id, payment_method }),
  });
}
