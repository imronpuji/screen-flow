import type { Installment, Loan, Notification, UserProfile } from '../types';

const DB_KEY = 'loanapp_mock_db';

interface MockUser extends UserProfile {
  password: string;
}

interface MockDb {
  users: MockUser[];
  loans: Loan[];
  installments: Installment[];
  notifications: Notification[];
}

const DEMO_USER: MockUser = {
  id: 'user-demo',
  full_name: 'Demo User',
  email: 'demo@loanapp.com',
  phone_number: '081234567890',
  password: 'Password1',
  kyc_status: 'verified',
};

function defaultDb(): MockDb {
  const activeLoanId = 'loan-active-1';
  return {
    users: [DEMO_USER],
    loans: [
      {
        id: activeLoanId,
        amount: 10_000_000,
        tenor_month: 12,
        purpose: 'Business',
        status: 'active',
        created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        disbursed_at: new Date(Date.now() - 25 * 86400000).toISOString(),
        principal: 10_000_000,
        remaining_balance: 8_500_000,
        next_due_date: new Date(Date.now() + 7 * 86400000).toISOString(),
      },
    ],
    installments: [
      {
        id: 'inst-1',
        loan_id: activeLoanId,
        due_date: new Date(Date.now() - 30 * 86400000).toISOString(),
        amount: 950_000,
        status: 'paid',
      },
      {
        id: 'inst-2',
        loan_id: activeLoanId,
        due_date: new Date(Date.now() + 7 * 86400000).toISOString(),
        amount: 950_000,
        status: 'unpaid',
      },
      {
        id: 'inst-3',
        loan_id: activeLoanId,
        due_date: new Date(Date.now() - 5 * 86400000).toISOString(),
        amount: 950_000,
        status: 'overdue',
      },
    ],
    notifications: [
      {
        id: 'notif-1',
        title: 'Installment Due Soon',
        message: 'Your next installment is due in 7 days.',
        read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: 'notif-2',
        title: 'KYC Verified',
        message: 'Your identity has been verified.',
        read: true,
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
  };
}

export function loadDb(): MockDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    /* ignore */
  }
  const db = defaultDb();
  saveDb(db);
  return db;
}

export function saveDb(db: MockDb): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function createToken(userId: string): string {
  return `mock.${userId}.${Date.now()}`;
}

export function parseToken(token: string | null): string | null {
  if (!token?.startsWith('mock.')) return null;
  return token.split('.')[1] ?? null;
}

export function getUserById(db: MockDb, id: string): MockUser | undefined {
  return db.users.find((u) => u.id === id);
}

export function toProfile(user: MockUser): UserProfile {
  const { password: _, ...profile } = user;
  return profile;
}

export type { MockDb, MockUser };
