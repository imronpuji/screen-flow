import { useRef, useState } from 'react';
import { uploadKtp } from '../api/users';
import type { KtpExtractedData } from '../api/types';
import { mockExtractKtp } from '../api/mock/ktpExtractor';
import { KtpExtractor } from '../components/KtpExtractor';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAnnounce } from '../hooks/useAnnounce';
import { isValidImageFile } from '../utils/validation';

export function ProfileScreen() {
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<KtpExtractedData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  const resetKtp = () => {
    setFile(null);
    setPreview(null);
    setExtracted(null);
    setFileError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const runExtraction = async (selected: File) => {
    setExtracting(true);
    setExtracted(null);
    try {
      const data = await mockExtractKtp(selected, user?.full_name);
      setExtracted(data);
      setAnnouncement('Data KTP berhasil diekstrak');
    } catch {
      showToast('Gagal mengekstrak KTP');
      resetKtp();
    } finally {
      setExtracting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const err = isValidImageFile(selected);
    if (err) {
      setFileError(err);
      resetKtp();
      return;
    }
    setFileError('');
    setFile(selected);
    const url = URL.createObjectURL(selected);
    setPreview(url);
    await runExtraction(selected);
  };

  const handleSubmit = async () => {
    if (!file || !extracted) {
      setFileError('Ekstrak KTP terlebih dahulu');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      await uploadKtp(file, setProgress);
      await refreshProfile();
      setAnnouncement('KTP berhasil disubmit');
      showToast('KTP berhasil diverifikasi', 'success');
      resetKtp();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? String((err as { error: string }).error)
          : 'Upload gagal';
      showToast(message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const kycStatus = user?.kyc_status ?? 'not_submitted';

  return (
    <Layout title="Profil" showBack>
      <div className="card profile-card">
        <div className="profile-avatar" aria-hidden="true">
          {user?.full_name?.charAt(0) ?? '?'}
        </div>
        <div className="profile-field">
          <span className="label">Nama Lengkap</span>
          <span>{user?.full_name}</span>
        </div>
        <div className="profile-field">
          <span className="label">Email</span>
          <span>{user?.email}</span>
        </div>
        <div className="profile-field">
          <span className="label">Telepon</span>
          <span>{user?.phone_number}</span>
        </div>
        <div className="profile-field">
          <span className="label">Status KYC</span>
          <span
            className={`badge badge-${kycStatus === 'verified' ? 'success' : kycStatus === 'rejected' ? 'danger' : 'warning'}`}
          >
            {kycStatus.replace('_', ' ')}
          </span>
        </div>
      </div>

      <section className="card">
        <h3 className="section-title">Verifikasi KTP</h3>
        <p className="text-muted">Foto KTP — data akan diekstrak otomatis (OCR mock)</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          className="sr-only"
          onChange={handleFileChange}
          disabled={uploading || extracting}
        />

        {!preview ? (
          <button
            type="button"
            className="ktp-upload-trigger"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <span className="ktp-upload-icon">📷</span>
            <span>Ambil foto / pilih dari galeri</span>
            <span className="text-muted">JPG/PNG, maks 5MB</span>
          </button>
        ) : (
          <KtpExtractor
            preview={preview}
            extracting={extracting}
            data={extracted}
            uploading={uploading}
            onConfirm={handleSubmit}
            onRetake={resetKtp}
          />
        )}

        {fileError && (
          <p className="field-msg" role="alert">
            {fileError}
          </p>
        )}

        {uploading && (
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </section>
    </Layout>
  );
}
