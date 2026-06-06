import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Layout } from '../components/Layout';
import { isValidAmount, isValidTenor } from '../utils/validation';

export function LoanApplicationScreen() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [tenor, setTenor] = useState('');
  const [purpose, setPurpose] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const next: Record<string, string> = {};
    const amountNum = parseFloat(amount);
    const tenorNum = parseInt(tenor, 10);

    if (!isValidAmount(amountNum)) next.amount = 'Amount must be greater than 0';
    if (!isValidTenor(tenorNum)) next.tenor = 'Tenor must be 3–36 months';
    if (!purpose.trim()) next.purpose = 'Purpose is required';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleContinue = () => {
    if (!validate()) return;
    navigate('/loan/review', {
      state: {
        amount: parseFloat(amount),
        tenor_month: parseInt(tenor, 10),
        purpose: purpose.trim(),
      },
    });
  };

  return (
    <Layout title="Loan Application" showBack>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
        noValidate
      >
        <Input
          label="Loan Amount (Rp)"
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount}
          required
        />
        <Input
          label="Tenor (months)"
          type="number"
          min={3}
          max={36}
          value={tenor}
          onChange={(e) => setTenor(e.target.value)}
          error={errors.tenor}
          required
        />
        <div className="field">
          <label htmlFor="purpose">Purpose</label>
          <textarea
            id="purpose"
            className={`input textarea ${errors.purpose ? 'input-error' : ''}`}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={3}
            required
          />
          {errors.purpose && (
            <span className="field-msg" role="alert">
              {errors.purpose}
            </span>
          )}
        </div>
        <Button type="submit" className="btn-block">
          Continue
        </Button>
      </form>
    </Layout>
  );
}
