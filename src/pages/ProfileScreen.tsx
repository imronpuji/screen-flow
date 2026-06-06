import { useRef, useState } from 'react';
import { uploadKtp } from '../api/users';
import { Button } from '../components/Button';
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
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const err = isValidImageFile(selected);
    if (err) {
      setFileError(err);
      setFile(null);
      setPreview(null);
      return;
    }
    setFileError('');
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const handleSubmit = async () => {
    if (!file) {
      setFileError('Please select a KTP image');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      await uploadKtp(file, setProgress);
      await refreshProfile();
      setAnnouncement('KTP uploaded successfully');
      showToast('KTP submitted successfully', 'success');
      setFile(null);
      setPreview(null);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? String((err as { error: string }).error)
          : 'Upload failed';
      showToast(message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const kycStatus = user?.kyc_status ?? 'not_submitted';

  return (
    <Layout title="Profile" showBack>
      <div className="card">
        <div className="profile-field">
          <span className="label">Full Name</span>
          <span>{user?.full_name}</span>
        </div>
        <div className="profile-field">
          <span className="label">Email</span>
          <span>{user?.email}</span>
        </div>
        <div className="profile-field">
          <span className="label">Phone</span>
          <span>{user?.phone_number}</span>
        </div>
        <div className="profile-field">
          <span className="label">KYC Status</span>
          <span className={`badge badge-${kycStatus === 'verified' ? 'success' : kycStatus === 'rejected' ? 'danger' : 'warning'}`}>
            {kycStatus.replace('_', ' ')}
          </span>
        </div>
      </div>

      <section className="card">
        <h3>Upload KTP</h3>
        <p className="text-muted">JPG or PNG, max 5MB</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          className="sr-only"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <div className="upload-area">
          {preview ? (
            <img src={preview} alt="KTP preview" className="ktp-preview" />
          ) : (
            <p>No image selected</p>
          )}
        </div>
        {fileError && (
          <p className="field-msg" role="alert">
            {fileError}
          </p>
        )}
        <div className="btn-row">
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            Choose Image
          </Button>
          <Button loading={uploading} onClick={handleSubmit} disabled={!file}>
            Submit KTP
          </Button>
        </div>
        {uploading && (
          <div className="progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </section>
    </Layout>
  );
}
