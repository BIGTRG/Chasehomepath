-- 014_seed_assistance.sql
-- Assistance programs (spec §7.3). rules_json is DATA (refreshed from source), never
-- hardcoded logic. Amounts/limits here are illustrative starting values for NC programs.

INSERT INTO assistance_programs (name, source, rules_json, active) VALUES
  ('NC Home Advantage Mortgage', 'nchfa',
   '{"maxAnnualIncome":134000,"minCreditScore":640,"amount":15000}'::jsonb, true),
  ('Community Partners Loan Pool', 'cplp',
   '{"maxAnnualIncome":90000,"minCreditScore":640,"amount":30000}'::jsonb, true),
  ('Mortgage Credit Certificate', 'mcc',
   '{"minCreditScore":640,"firstTimeBuyerRequired":true,"amount":2000}'::jsonb, true),
  ('FHA Loan Program', 'fha',
   '{"minCreditScore":580,"amount":0}'::jsonb, true),
  ('Down Payment Assistance', 'dpa',
   '{"maxAnnualIncome":100000,"minCreditScore":600,"amount":8000}'::jsonb, true);
