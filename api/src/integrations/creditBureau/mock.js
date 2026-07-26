/**
 * Mock credit-bureau adapter. Returns a deterministic synthetic report so the rules
 * engine and dispute flow can be exercised end-to-end without a real bureau.
 * Swap for a real adapter (Phase 3 integration) behind the same interface.
 */
export function createMockCreditBureauAdapter() {
  return {
    name: 'mock',
    /** pullReport(member) -> normalized report */
    async pullReport(member) {
      const now = new Date('2026-07-01T00:00:00Z');
      return {
        source: 'mock-bureau',
        pulledAt: now.toISOString(),
        // `raw` is stored encrypted (raw_ref). Score lives here, gated on the meeting rule.
        raw: { provider: 'mock', memberRef: member?.id ?? null },
        score: 612,
        items: [
          {
            creditor: 'Summit Card',
            type: 'revolving',
            balance: 1450.0,
            member_recorded_balance: 1450.0,
            date_opened: '2021-03-10',
            first_delinquency_date: null,
            recognized: true,
            duplicate_of: null,
            past_due: 0,
          },
          {
            creditor: 'Auto Finance Co',
            type: 'installment',
            balance: 8800.0,
            member_recorded_balance: 8800.0,
            date_opened: '2023-06-01',
            first_delinquency_date: null,
            recognized: true,
            duplicate_of: null,
            past_due: 0,
          },
          {
            // Balance mismatch -> disputable
            creditor: 'Metro Retail',
            type: 'revolving',
            balance: 940.0,
            member_recorded_balance: 300.0,
            date_opened: '2020-01-15',
            first_delinquency_date: null,
            recognized: true,
            duplicate_of: null,
            past_due: 0,
          },
          {
            // Not recognized -> disputable
            creditor: 'Unknown Lender LLC',
            type: 'collection',
            balance: 512.0,
            member_recorded_balance: null,
            date_opened: '2022-11-01',
            first_delinquency_date: '2022-09-01',
            recognized: false,
            duplicate_of: null,
            past_due: 512.0,
          },
          {
            // Obsolete (> 7 years) -> disputable
            creditor: 'Old Collections Inc',
            type: 'collection',
            balance: 210.0,
            member_recorded_balance: 210.0,
            date_opened: '2015-02-01',
            first_delinquency_date: '2016-01-01',
            recognized: true,
            duplicate_of: null,
            past_due: 210.0,
          },
        ],
      };
    },
  };
}
