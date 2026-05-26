import type { Decimal } from "@prisma/client/runtime/library";

export interface BalancePair {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

interface ExpenseForBalance {
  paid_by: string;
  splits: { user_id: string; amount: Decimal | number }[];
}

interface SettlementForBalance {
  from_user_id: string;
  to_user_id: string;
  amount: Decimal | number;
}

function toNum(v: Decimal | number): number {
  return typeof v === "number" ? v : v.toNumber();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeNetBalances(
  expenses: ExpenseForBalance[],
  settlements: SettlementForBalance[]
): Record<string, number> {
  const net: Record<string, number> = {};

  const ensure = (id: string) => {
    if (net[id] === undefined) net[id] = 0;
  };

  for (const expense of expenses) {
    ensure(expense.paid_by);
    for (const split of expense.splits) {
      ensure(split.user_id);
      if (split.user_id !== expense.paid_by) {
        const amt = round2(toNum(split.amount));
        net[expense.paid_by] += amt;
        net[split.user_id] -= amt;
      }
    }
  }

  for (const s of settlements) {
    ensure(s.from_user_id);
    ensure(s.to_user_id);
    const amt = round2(toNum(s.amount));
    net[s.from_user_id] += amt;
    net[s.to_user_id] -= amt;
  }

  Object.keys(net).forEach((k) => {
    net[k] = round2(net[k]);
  });

  return net;
}

export function simplifyDebts(net: Record<string, number>): BalancePair[] {
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [id, amount] of Object.entries(net)) {
    if (amount > 0.01) creditors.push({ id, amount });
    else if (amount < -0.01) debtors.push({ id, amount: -amount });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const pairs: BalancePair[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const transfer = round2(Math.min(c.amount, d.amount));

    pairs.push({ fromUserId: d.id, toUserId: c.id, amount: transfer });

    c.amount = round2(c.amount - transfer);
    d.amount = round2(d.amount - transfer);

    if (c.amount < 0.01) ci++;
    if (d.amount < 0.01) di++;
  }

  return pairs;
}
