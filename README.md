# MiniLedger

MiniLedger is a learning-focused full-stack mobile app for tracking money lent to friends. It includes phone-number login with a mock OTP, loan records, repayment status, an overdue-aware summary, and optional receipt-photo upload.

## Features

- Mock OTP login (OTP appears in the backend terminal; valid for five minutes and one use)
- User-specific loan records
- Add a loan with friend name, amount, and due date
- Mark a loan as repaid
- Dashboard summary: total lent, total repaid, overdue amount
- Overdue loans are highlighted
- Optional JPG, PNG, or WEBP receipt upload (maximum 5 MB)
- Input validation, JWT-protected loan endpoints, and summary unit tests

## Tech stack

- Mobile: React Native, Expo, TypeScript
- API: Node.js, Express, TypeScript
- Database: PostgreSQL, Prisma ORM
- Validation: Zod
- Authentication: mock OTP + JWT
- Tests: Jest

## Project structure

```text
miniledger/
├── backend/
│   ├── prisma/schema.prisma
│   ├── src/app.ts
│   ├── src/server.ts
│   ├── src/routes/auth.ts
│   ├── src/routes/loans.ts
│   ├── src/utils/summary.ts
│   └── tests/summary.test.ts
└── mobile/
    ├── App.tsx
    └── src/config.ts
```

## Prerequisites

Install Node.js LTS, PostgreSQL, and (for mobile testing) Expo Go on your phone or an Android/iOS emulator. A PostgreSQL database named `miniledger` should exist before running migrations.

## Run the backend

1. Open a terminal in `backend/` and install packages:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and update `DATABASE_URL` with your PostgreSQL username and password. Replace `JWT_SECRET` with a long random value.
3. Create the database in PostgreSQL if it does not exist:
   ```sql
   CREATE DATABASE miniledger;
   ```
4. Generate the Prisma client and create the tables:
   ```bash
   npm run db:generate
   npm run db:migrate -- --name init
   ```
5. Start the API:
   ```bash
   npm run dev
   ```
6. Visit `http://localhost:4000/api/health`; the response should include `"status":"ok"`.

## Run the mobile app

1. In a second terminal, open `mobile/` and install packages:
   ```bash
   npm install
   ```
2. Edit `mobile/src/config.ts` to point to the backend:
   - Android emulator: `http://10.0.2.2:4000/api`
   - iOS simulator: `http://localhost:4000/api`
   - Physical phone: use your computer's local network IP, e.g. `http://192.168.1.10:4000/api`. Both devices must be on the same network and your firewall must allow port 4000.
3. Start Expo:
   ```bash
   npx expo start
   ```
4. Scan the QR code with Expo Go, or open the app in a simulator.
5. Enter a phone number with country code, request the OTP, then read the OTP from the backend terminal and enter it in the app.

## API reference

All paths are relative to `/api`.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | No | Health check |
| POST | `/auth/request-otp` | No | Generate mock OTP; body: `{ "phone": "+919876543210" }` |
| POST | `/auth/verify-otp` | No | Verify OTP; body: `{ "phone": "+919876543210", "otp": "123456" }` |
| GET | `/loans` | Bearer token | List current user's loans |
| POST | `/loans` | Bearer token | Create loan; JSON body or multipart form with `friendName`, `amount`, `dueDate`, optional `receipt` |
| PATCH | `/loans/:id/repay` | Bearer token | Mark one of the current user's loans as repaid |
| GET | `/loans/summary` | Bearer token | Return `totalLent`, `totalRepaid`, and `overdueAmount` |

For authenticated requests, send `Authorization: Bearer <token>`. Amounts are represented in INR in the app; the database stores a decimal amount. `totalLent` includes all loans, `totalRepaid` includes repaid loans, and `overdueAmount` includes only unpaid loans whose due date is in the past.

## Tests

From `backend/` run:

```bash
npm test
```

The summary calculation tests cover totals, overdue logic, and an empty list.

## Important limitations

This is an internship/demo project, not production financial software. OTPs are deliberately logged to the server terminal and stored in memory; restarting the server clears pending OTPs. Use a real SMS provider, rate limiting, persistent OTP storage, secure upload storage, stricter CORS, HTTPS, and additional security review before any real deployment. Uploaded receipt images are stored locally in `backend/uploads/` and are not backed up automatically.
