import type { KtpExtractedData } from '../types';

/** Simulates OCR scan on KTP image (~2s) */
export async function mockExtractKtp(
  _file: File,
  fallbackName?: string
): Promise<KtpExtractedData> {
  const steps = [20, 45, 70, 90, 100];
  for (const _ of steps) {
    await new Promise((r) => setTimeout(r, 400));
  }

  const name = fallbackName ?? 'DEMO USER';
  return {
    nik: '3174010101990001',
    full_name: name.toUpperCase(),
    place_of_birth: 'JAKARTA',
    date_of_birth: '01-01-1999',
    gender: 'LAKI-LAKI',
    address: 'JL. SUDIRMAN NO. 123',
    rt_rw: '001/002',
    village: 'SENAYAN',
    district: 'KEBAYORAN BARU',
    religion: 'ISLAM',
    marital_status: 'BELUM KAWIN',
    occupation: 'KARYAWAN SWASTA',
    nationality: 'WNI',
    confidence: 96.8,
  };
}
