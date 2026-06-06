import { apiRequest } from './client';
import type { UserProfile } from './types';

export function getProfile() {
  return apiRequest<UserProfile>('/api/users/profile');
}

export function uploadKtp(file: File, onProgress?: (pct: number) => void) {
  const formData = new FormData();
  formData.append('ktp', file);

  return new Promise<UserProfile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.example.com/api/users/ktp');

    const token = localStorage.getItem('access_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        reject(new Error('Unauthorized'));
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body);
        } else {
          reject(body);
        }
      } catch {
        reject({ error: 'Upload failed' });
      }
    };

    xhr.onerror = () => reject({ error: 'Network error' });
    xhr.send(formData);
  });
}
