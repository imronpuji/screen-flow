# Loan Journey App (React)

Mobile-first React web app implementing the full loan journey screen flow with API integration.

## Tech Stack

- React 19 + TypeScript
- Vite
- React Router v7

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
npm run preview
```

## API Configuration

Base URL: `https://api.example.com`

All protected endpoints send `Authorization: Bearer <token>` and `Content-Type: application/json`.

## Screens

| # | Screen | Route |
|---|--------|-------|
| 1 | Splash | `/` |
| 2 | Login | `/login` |
| 3 | Register | `/register` |
| 4 | OTP Verification | `/otp` |
| 5 | Dashboard | `/dashboard` |
| 6 | Profile | `/profile` |
| 7 | Loan Application | `/loan/apply` |
| 8 | Review Application | `/loan/review` |
| 9 | Application Status | `/loan/status/:id` |
| 10 | Active Loan Detail | `/loan/active` |
| 11 | Installment List | `/installments` |
| 12 | Payment | `/payment/:installmentId` |
| 13 | Payment History | `/payments/history` |

## Global Behaviors

- Bearer token attached on protected requests
- 401 responses clear token and redirect to Login
- API errors parsed from `{ error, code }`; 422 field errors surfaced inline
- Exponential backoff retry for idempotent GET requests
- Screen reader announcements for loading/success states
