import type { KtpExtractedData } from '../api/types';
import { Button } from './Button';
import { Spinner } from './Spinner';

interface KtpExtractorProps {
  preview: string;
  extracting: boolean;
  data: KtpExtractedData | null;
  uploading?: boolean;
  onConfirm: () => void;
  onRetake: () => void;
}

const FIELDS: { key: keyof KtpExtractedData; label: string }[] = [
  { key: 'nik', label: 'NIK' },
  { key: 'full_name', label: 'Nama' },
  { key: 'place_of_birth', label: 'Tempat Lahir' },
  { key: 'date_of_birth', label: 'Tanggal Lahir' },
  { key: 'gender', label: 'Jenis Kelamin' },
  { key: 'address', label: 'Alamat' },
  { key: 'rt_rw', label: 'RT/RW' },
  { key: 'village', label: 'Kel/Desa' },
  { key: 'district', label: 'Kecamatan' },
  { key: 'religion', label: 'Agama' },
  { key: 'marital_status', label: 'Status Perkawinan' },
  { key: 'occupation', label: 'Pekerjaan' },
  { key: 'nationality', label: 'Kewarganegaraan' },
];

export function KtpExtractor({ preview, extracting, data, uploading, onConfirm, onRetake }: KtpExtractorProps) {
  return (
    <div className="ktp-extractor">
      <div className="ktp-scan-frame">
        <img src={preview} alt="KTP preview" className="ktp-preview" />
        {extracting && (
          <div className="ktp-scan-overlay" aria-hidden="true">
            <div className="ktp-scan-line" />
          </div>
        )}
      </div>

      {extracting && (
        <div className="ktp-extracting-status" role="status">
          <Spinner label="Extracting KTP data" />
          <p>Mengekstrak data KTP...</p>
        </div>
      )}

      {data && !extracting && (
        <div className="ktp-result card">
          <div className="ktp-result-header">
            <span className="badge badge-success">OCR Selesai</span>
            <span className="text-muted">Akurasi {data.confidence}%</span>
          </div>
          <dl className="ktp-fields">
            {FIELDS.map(({ key, label }) => (
              <div key={key} className="ktp-field">
                <dt>{label}</dt>
                <dd>{String(data[key])}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted ktp-disclaimer">
            Pastikan data sesuai KTP fisik Anda sebelum submit.
          </p>
          <div className="btn-row">
            <Button variant="secondary" onClick={onRetake} disabled={uploading}>
              Foto Ulang
            </Button>
            <Button loading={uploading} onClick={onConfirm}>
              Konfirmasi & Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
