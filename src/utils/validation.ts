const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

export function isValidPhone(phone: string): boolean {
  return /^08\d{8,11}$/.test(phone.replace(/\s/g, ''));
}

export function isValidOtp(otp: string): boolean {
  return /^\d{6}$/.test(otp);
}

export function isValidAmount(amount: number): boolean {
  return amount > 0;
}

export function isValidTenor(tenor: number): boolean {
  return Number.isInteger(tenor) && tenor >= 3 && tenor <= 36;
}

export function isValidImageFile(file: File): string | null {
  const allowed = ['image/jpeg', 'image/png'];
  if (!allowed.includes(file.type)) return 'File must be JPG or PNG';
  if (file.size > 5 * 1024 * 1024) return 'File must be 5MB or less';
  return null;
}
