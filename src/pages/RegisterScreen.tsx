import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/auth';
import { ApiClientError } from '../api/client';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Layout } from '../components/Layout';
import { useToast } from '../context/ToastContext';
import { useAnnounce } from '../hooks/useAnnounce';
import {
  isValidEmail,
  isStrongPassword,
  isValidPhone,
} from '../utils/validation';

export function RegisterScreen() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.full_name.trim()) next.full_name = 'Full name is required';
    if (!isValidEmail(form.email)) next.email = 'Enter a valid email address';
    if (!isValidPhone(form.phone_number)) next.phone_number = 'Phone must start with 08';
    if (!isStrongPassword(form.password))
      next.password = 'Password must be 8+ chars with uppercase and number';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      await register(form);
      setAnnouncement('Registration successful');
      navigate('/otp', { state: { email: form.email, phone: form.phone_number } });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 422 && err.fields) {
        const fieldErrors: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(err.fields)) {
          fieldErrors[key] = msgs[0];
        }
        setErrors(fieldErrors);
      } else if (err instanceof ApiClientError) {
        showToast(err.message);
      } else {
        showToast('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Register" showBack>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <Input
          label="Full Name"
          value={form.full_name}
          onChange={(e) => update('full_name', e.target.value)}
          error={errors.full_name}
          disabled={loading}
          required
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          error={errors.email}
          disabled={loading}
          required
        />
        <Input
          label="Phone"
          type="tel"
          placeholder="08xxxxxxxxxx"
          value={form.phone_number}
          onChange={(e) => update('phone_number', e.target.value)}
          error={errors.phone_number}
          disabled={loading}
          required
        />
        <Input
          label="Password"
          type="password"
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          error={errors.password}
          disabled={loading}
          required
        />
        <Button type="submit" loading={loading} className="btn-block">
          Register
        </Button>
        <p className="form-footer">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </form>
    </Layout>
  );
}
