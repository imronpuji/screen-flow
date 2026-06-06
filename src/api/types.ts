export interface ApiError {
  error: string;
  code?: string;
  fields?: Record<string, string[]>;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  kyc_status: 'pending' | 'verified' | 'rejected' | 'not_submitted';
}

export interface KtpExtractedData {
  nik: string;
  full_name: string;
  place_of_birth: string;
  date_of_birth: string;
  gender: string;
  address: string;
  rt_rw: string;
  village: string;
  district: string;
  religion: string;
  marital_status: string;
  occupation: string;
  nationality: string;
  confidence: number;
}

export interface Loan {
  id: string;
  amount: number;
  tenor_month: number;
  purpose: string;
  status: 'under_review' | 'approved' | 'rejected' | 'active' | 'completed';
  created_at: string;
  disbursed_at?: string;
  principal?: number;
  remaining_balance?: number;
  next_due_date?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface Installment {
  id: string;
  loan_id: string;
  due_date: string;
  amount: number;
  status: 'unpaid' | 'paid' | 'overdue';
}

export interface Payment {
  payment_id: string;
  installment_id: string;
  status: 'pending' | 'success' | 'failed';
  payment_method: string;
  va_number?: string;
}

export interface LoginResponse {
  access_token: string;
}

export interface LoanApplicationDraft {
  amount: number;
  tenor_month: number;
  purpose: string;
}
