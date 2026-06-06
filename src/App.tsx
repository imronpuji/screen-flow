import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { SplashScreen } from './pages/SplashScreen';
import { LoginScreen } from './pages/LoginScreen';
import { RegisterScreen } from './pages/RegisterScreen';
import { OTPVerificationScreen } from './pages/OTPVerificationScreen';
import { DashboardScreen } from './pages/DashboardScreen';
import { ProfileScreen } from './pages/ProfileScreen';
import { LoanApplicationScreen } from './pages/LoanApplicationScreen';
import { ReviewApplicationScreen } from './pages/ReviewApplicationScreen';
import { ApplicationStatusScreen } from './pages/ApplicationStatusScreen';
import { ActiveLoanDetailScreen } from './pages/ActiveLoanDetailScreen';
import { InstallmentListScreen } from './pages/InstallmentListScreen';
import { PaymentScreen } from './pages/PaymentScreen';
import { PaymentHistoryScreen } from './pages/PaymentHistoryScreen';
import { NotificationsScreen } from './pages/NotificationsScreen';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/register" element={<RegisterScreen />} />
      <Route path="/otp" element={<OTPVerificationScreen />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfileScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/loan/apply"
        element={
          <ProtectedRoute>
            <LoanApplicationScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/loan/review"
        element={
          <ProtectedRoute>
            <ReviewApplicationScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/loan/status/:id"
        element={
          <ProtectedRoute>
            <ApplicationStatusScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/loan/active"
        element={
          <ProtectedRoute>
            <ActiveLoanDetailScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/installments"
        element={
          <ProtectedRoute>
            <InstallmentListScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payment/:installmentId"
        element={
          <ProtectedRoute>
            <PaymentScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments/history"
        element={
          <ProtectedRoute>
            <PaymentHistoryScreen />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
