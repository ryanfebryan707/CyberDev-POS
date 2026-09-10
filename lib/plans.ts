export const subscriptionPlans = {
  weekly: { label: "Mingguan", days: 7, amount: 60000 },
  monthly: { label: "Bulanan", days: 30, amount: 200000 },
  quarterly: { label: "3 Bulan", days: 90, amount: 550000 },
  halfyear: { label: "6 Bulan", days: 180, amount: 1100000 },
  yearly: { label: "12 Bulan", days: 365, amount: 2100000 },
  twoyear: { label: "24 Bulan", days: 730, amount: 4400000 },
} as const;

export type PlanCode = keyof typeof subscriptionPlans;

export function isPlanCode(value: string): value is PlanCode {
  return Object.hasOwn(subscriptionPlans, value);
}
