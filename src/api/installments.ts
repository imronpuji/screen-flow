import { apiRequest } from './client';
import type { Installment } from './types';

export function getInstallments() {
  return apiRequest<Installment[]>('/api/installments');
}
