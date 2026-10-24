import { calculateSummary } from '../src/utils/summary';

describe('calculateSummary', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  it('totals lent, repaid, and only unpaid overdue loans', () => {
    const result = calculateSummary([
      { amount: '100.00', isRepaid: false, dueDate: '2026-10-01T00:00:00.000Z' },
      { amount: 50, isRepaid: true, dueDate: '2026-10-02T00:00:00.000Z' },
      { amount: 25.5, isRepaid: false, dueDate: '2026-11-01T00:00:00.000Z' }
    ], now);
    expect(result).toEqual({ totalLent: 175.5, totalRepaid: 50, overdueAmount: 100 });
  });
  it('returns zeroes for an empty list', () => {
    expect(calculateSummary([], now)).toEqual({ totalLent: 0, totalRepaid: 0, overdueAmount: 0 });
  });
});
