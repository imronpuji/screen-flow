import { ApiClientError } from '../errors';
import type { Loan, Payment, UserProfile } from '../types';
import {
  createToken,
  getUserById,
  loadDb,
  parseToken,
  saveDb,
  toProfile,
  type MockUser,
} from './store';

async function delay(ms = 400): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function requireUser(token: string | null): MockUser {
  const userId = parseToken(token);
  if (!userId) throw new ApiClientError(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
  const db = loadDb();
  const user = getUserById(db, userId);
  if (!user) throw new ApiClientError(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
  return user;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export async function mockRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: string;
    token?: string | null;
  } = {}
): Promise<T> {
  await delay();
  const method = (options.method ?? 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : undefined;

  // Auth
  if (path === '/api/auth/login' && method === 'POST') {
    const db = loadDb();
    const user = db.users.find(
      (u) => u.email === body.email && u.password === body.password
    );
    if (!user) {
      throw new ApiClientError(401, { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }
    return { access_token: createToken(user.id) } as T;
  }

  if (path === '/api/auth/register' && method === 'POST') {
    const db = loadDb();
    if (db.users.some((u) => u.email === body.email)) {
      throw new ApiClientError(422, {
        error: 'Validation failed',
        fields: { email: ['Email already registered'] },
      });
    }
    if (db.users.some((u) => u.phone_number === body.phone_number)) {
      throw new ApiClientError(422, {
        error: 'Validation failed',
        fields: { phone_number: ['Phone already registered'] },
      });
    }
    const user: MockUser = {
      id: nextId('user'),
      full_name: body.full_name,
      email: body.email,
      phone_number: body.phone_number,
      password: body.password,
      kyc_status: 'not_submitted',
    };
    db.users.push(user);
    saveDb(db);
    return undefined as T;
  }

  // Users
  if (path === '/api/users/profile' && method === 'GET') {
    const user = requireUser(options.token ?? null);
    return toProfile(user) as T;
  }

  // Loans
  if (path === '/api/loans/active' && method === 'GET') {
    requireUser(options.token ?? null);
    const db = loadDb();
    const loan = db.loans.find((l) => l.status === 'active') ?? null;
    return loan as T;
  }

  if (path.match(/^\/api\/loans\/[^/]+$/) && method === 'GET') {
    requireUser(options.token ?? null);
    const id = path.split('/').pop()!;
    const db = loadDb();
    const loan = db.loans.find((l) => l.id === id);
    if (!loan) throw new ApiClientError(404, { error: 'Loan not found', code: 'NOT_FOUND' });
    return loan as T;
  }

  if (path === '/api/loans' && method === 'POST') {
    requireUser(options.token ?? null);
    const db = loadDb();
    const loan: Loan = {
      id: nextId('loan'),
      amount: body.amount,
      tenor_month: body.tenor_month,
      purpose: body.purpose,
      status: 'under_review',
      created_at: new Date().toISOString(),
    };
    db.loans.unshift(loan);
    db.notifications.unshift({
      id: nextId('notif'),
      title: 'Application Submitted',
      message: `Loan application for Rp ${body.amount.toLocaleString('id-ID')} is under review.`,
      read: false,
      created_at: new Date().toISOString(),
    });
    saveDb(db);
    return loan as T;
  }

  // Installments
  if (path === '/api/installments' && method === 'GET') {
    requireUser(options.token ?? null);
    return loadDb().installments as T;
  }

  // Payments
  if (path === '/api/payments' && method === 'POST') {
    requireUser(options.token ?? null);
    const validMethods = ['Virtual Account', 'Bank Transfer', 'E-Wallet'];
    if (!validMethods.includes(body.payment_method)) {
      throw new ApiClientError(422, {
        error: 'Invalid payment method',
        fields: { payment_method: ['Must be Virtual Account, Bank Transfer, or E-Wallet'] },
      });
    }

    const db = loadDb();
    const installment = db.installments.find((i) => i.id === body.installment_id);
    if (!installment) {
      throw new ApiClientError(404, { error: 'Installment not found', code: 'NOT_FOUND' });
    }

    let payment: Payment;
    if (body.payment_method === 'Virtual Account') {
      payment = {
        payment_id: nextId('pay'),
        installment_id: body.installment_id,
        status: 'pending',
        payment_method: body.payment_method,
        va_number: '8801234567890123',
      };
    } else if (body.payment_method === 'E-Wallet') {
      installment.status = 'paid';
      saveDb(db);
      payment = {
        payment_id: nextId('pay'),
        installment_id: body.installment_id,
        status: 'success',
        payment_method: body.payment_method,
      };
    } else {
      payment = {
        payment_id: nextId('pay'),
        installment_id: body.installment_id,
        status: 'failed',
        payment_method: body.payment_method,
      };
    }
    return payment as T;
  }

  // Notifications
  if (path === '/api/notifications' && method === 'GET') {
    requireUser(options.token ?? null);
    return loadDb().notifications as T;
  }

  throw new ApiClientError(404, { error: `Mock route not found: ${method} ${path}` });
}

export async function mockUploadKtp(
  token: string | null,
  onProgress?: (pct: number) => void
): Promise<UserProfile> {
  const user = requireUser(token);
  for (let p = 0; p <= 100; p += 25) {
    await delay(150);
    onProgress?.(p);
  }
  const db = loadDb();
  const stored = getUserById(db, user.id);
  if (stored) {
    stored.kyc_status = 'pending';
    saveDb(db);
    return toProfile(stored);
  }
  return toProfile(user);
}
