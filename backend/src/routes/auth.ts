import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../prisma';

const router = Router();
const otpStore = new Map<string, { otp: string; expiresAt: number }>();
const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number with country code.');

router.post('/request-otp', (req, res) => {
  const parsed = z.object({ phone: phoneSchema }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid phone number.' });
  }

  const { phone } = parsed.data;
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

  // Assignment requirement: print the mock OTP in the server log.
  console.log(`[MiniLedger mock OTP] ${phone}: ${otp} (valid for 5 minutes)`);
  return res.json({ message: 'Mock OTP generated. Check the backend terminal log.' });
});

router.post('/verify-otp', async (req, res, next) => {
  const parsed = z.object({
    phone: phoneSchema,
    otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits.'),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' });
  }

  try {
    const { phone, otp } = parsed.data;
    const stored = otpStore.get(phone);

    if (!stored || stored.expiresAt < Date.now() || stored.otp !== otp) {
      return res.status(401).json({ error: 'Incorrect or expired OTP. Request a new one.' });
    }

    otpStore.delete(phone);
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });
    const token = jwt.sign({}, process.env.JWT_SECRET || 'development-only-secret', {
      subject: user.id,
      expiresIn: '7d',
    });

    return res.json({ token, user: { id: user.id, phone: user.phone } });
  } catch (error) {
    next(error);
  }
});

export default router;

