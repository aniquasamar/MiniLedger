import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { calculateSummary, isPastDue } from '../utils/summary';

const router = Router();
router.use(requireAuth);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.resolve(process.cwd(), 'uploads')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
  else cb(new Error('Receipt must be a JPG, PNG, or WEBP image.'));
} });
const createSchema = z.object({
  friendName: z.string().trim().min(1, 'Friend name is required.').max(80),
  amount: z.coerce.number().positive('Amount must be greater than zero.').max(999999999),
  dueDate: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'Enter a valid due date.')
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const loans = await prisma.loan.findMany({ where: { userId: req.userId }, orderBy: [{ isRepaid: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }] });
    res.json(loans.map(loan => ({ ...loan, amount: Number(loan.amount), isOverdue: !loan.isRepaid && isPastDue(loan.dueDate) })));
  } catch (error) { next(error); }
});

router.post('/', upload.single('receipt'), async (req: AuthRequest, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid loan details.' });
  try {
    const loan = await prisma.loan.create({ data: {
      friendName: parsed.data.friendName,
      amount: parsed.data.amount,
      dueDate: new Date(parsed.data.dueDate),
      receiptPath: req.file ? `/uploads/${req.file.filename}` : null,
      userId: req.userId!
    } });
    res.status(201).json({ ...loan, amount: Number(loan.amount), isOverdue: !loan.isRepaid && isPastDue(loan.dueDate) });
  } catch (error) { next(error); }
});

router.patch('/:id/repay', async (req: AuthRequest, res, next) => {
  try {
    const loanId = Array.isArray(req.params.id)
  ? req.params.id[0]
  : req.params.id;

if (!loanId) {
  return res.status(400).json({ error: 'Invalid loan ID.' });
}

const existing = await prisma.loan.findFirst({
  where: { id: loanId, userId: req.userId },
});
    if (!existing) return res.status(404).json({ error: 'Loan not found.' });
    if (existing.isRepaid) return res.status(409).json({ error: 'This loan is already marked as repaid.' });
    const loan = await prisma.loan.update({ where: { id: existing.id }, data: { isRepaid: true, repaidAt: new Date() } });
    res.json({ ...loan, amount: Number(loan.amount), isOverdue: false });
  } catch (error) { next(error); }
});

router.get('/summary', async (req: AuthRequest, res, next) => {
  try {
    const loans = await prisma.loan.findMany({ where: { userId: req.userId }, select: { amount: true, isRepaid: true, dueDate: true } });
    res.json(calculateSummary(loans));
  } catch (error) { next(error); }
});

export default router;
