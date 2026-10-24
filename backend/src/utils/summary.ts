export type SummaryLoan = { amount: number | string | { toString(): string }; isRepaid: boolean; dueDate: Date | string };

/** Treat a loan as overdue only after its due calendar date has passed. */
export function isPastDue(dueDate: Date | string, now = new Date()) {
  const dueDay = new Date(dueDate).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return dueDay < today;
}

/** Pure function kept separate so summary rules are easy to test. */
export function calculateSummary(loans: SummaryLoan[], now = new Date()) {
  let totalLent = 0;
  let totalRepaid = 0;
  let overdueAmount = 0;

  for (const loan of loans) {
    const amount = Number(loan.amount);
    totalLent += amount;
    if (loan.isRepaid) totalRepaid += amount;
    else if (isPastDue(loan.dueDate, now)) overdueAmount += amount;
  }

  // Avoid floating point noise in currency values.
  const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  return { totalLent: money(totalLent), totalRepaid: money(totalRepaid), overdueAmount: money(overdueAmount) };
}
