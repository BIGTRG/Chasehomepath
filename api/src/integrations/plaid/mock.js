/**
 * Mock Plaid adapter. Provides bank-link + transaction data without a real Plaid
 * connection, behind the same interface a real adapter implements (spec §11.4).
 */
export function createMockPlaidAdapter() {
  return {
    name: 'mock',

    async createLinkToken(member) {
      return { linkToken: `link-mock-${member?.id ?? 'anon'}` };
    },

    /** Exchange a public token from Plaid Link for a persistent item id. */
    async exchangePublicToken(_publicToken) {
      return { itemId: `item-mock-${Math.floor(Math.random() * 1e6)}`, institution: 'Mock Federal Bank' };
    },

    /** Return transactions for the item since a date (inclusive). Deterministic sample. */
    async fetchTransactions(_itemId, { since } = {}) {
      // Dates land in the current calendar month so month-to-date views and
      // tests are stable regardless of when they run (days 2..18 exist in every month).
      const ym = new Date().toISOString().slice(0, 7);
      const d = (day) => `${ym}-${String(day).padStart(2, '0')}`;
      const all = [
        { date: d(2), amount: 1850.0, category: 'income', merchant: 'Employer Payroll' },
        { date: d(3), amount: 1200.0, category: 'housing', merchant: 'Rent' },
        { date: d(5), amount: 320.0, category: 'groceries', merchant: 'SuperMart' },
        { date: d(8), amount: 145.0, category: 'dining', merchant: 'Cafe Row' },
        { date: d(10), amount: 90.0, category: 'transport', merchant: 'Transit Card' },
        { date: d(12), amount: 210.0, category: 'dining', merchant: 'Restaurants' },
        { date: d(15), amount: 60.0, category: 'utilities', merchant: 'Power Co' },
        { date: d(18), amount: 250.0, category: 'shopping', merchant: 'Online Store' },
      ];
      if (!since) return all;
      return all.filter((t) => t.date >= since);
    },
  };
}
