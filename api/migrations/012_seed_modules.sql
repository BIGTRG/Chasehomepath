-- 012_seed_modules.sql
-- Starter education curriculum (spec §6, §4.13 before/during/after structure).
-- Reference/lookup data seeded once. Content_ref points at the CMS/asset store later.

INSERT INTO modules (title, phase, duration_min, content_ref) VALUES
  ('How homeownership works',            'before', 8,  'mod/before/how-it-works'),
  ('Understanding your credit report',   'before', 12, 'mod/before/credit-report'),
  ('Building a homebuying budget',       'before', 10, 'mod/before/budget'),
  ('Saving for a down payment',          'before', 9,  'mod/before/down-payment'),
  ('Assistance programs 101',            'before', 11, 'mod/before/assistance'),
  ('Making an offer',                    'during', 10, 'mod/during/offer'),
  ('The mortgage process',               'during', 14, 'mod/during/mortgage'),
  ('Home inspection basics',             'during', 9,  'mod/during/inspection'),
  ('Closing day: what to expect',        'during', 8,  'mod/during/closing'),
  ('Your first 90 days as a homeowner',  'after',  10, 'mod/after/first-90-days'),
  ('Escrow, taxes, and insurance',       'after',  12, 'mod/after/escrow-taxes'),
  ('Home maintenance essentials',        'after',  13, 'mod/after/maintenance'),
  ('When refinancing makes sense',       'after',  11, 'mod/after/refinance');
