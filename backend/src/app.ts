import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth';
import loanRoutes from './routes/loans';

export const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'MiniLedger API' }));
app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use(((error, _req, res, _next) => {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  const status = message.includes('Receipt must') || message.includes('File too large') ? 400 : 500;
  res.status(status).json({ error: status === 500 ? 'Unexpected server error.' : message });
}) as ErrorRequestHandler);
