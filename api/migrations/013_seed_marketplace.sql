-- 013_seed_marketplace.sql
-- House-plan catalog (spec §3: 1,100–1,400 sqft; configs 3/2, 3/2.5, 4/3, 4/3.5) and a
-- few sample listings so plan-to-lot matching and source labeling can be exercised.

INSERT INTO house_plans (name, beds, baths, sqft, foundation, est_build_low, est_build_high, build_months, priority_tags) VALUES
  ('Aspen 3/2',    3, 2.0, 1100, 'slab',      165000, 195000, 6, '["starter","single_story"]'),
  ('Birch 3/2.5',  3, 2.5, 1250, 'slab',      185000, 220000, 7, '["family"]'),
  ('Cedar 4/3',    4, 3.0, 1350, 'crawlspace', 205000, 245000, 8, '["family","two_story"]'),
  ('Dogwood 4/3.5',4, 3.5, 1400, 'crawlspace', 220000, 265000, 8, '["family","two_story"]');

-- Sample listings. Source is ALWAYS present and shown (spec §8 source labeling).
INSERT INTO listings (type, source, status, price, address, geo, beds, baths, sqft, foundation, remaining_work_cost, mls_ref) VALUES
  ('house', 'owned',   'active', 189000, '412 Maple St, Durham, NC',   '{"lat":35.99,"lng":-78.90}', 3, 2.0, 1180, 'slab',        0,     NULL),
  ('house', 'partner', 'active', 235000, '88 Oak Ridge, Raleigh, NC',  '{"lat":35.78,"lng":-78.64}', 4, 3.0, 1360, 'crawlspace',  15000, NULL),
  ('house', 'mls',     'active', 268000, '1201 Pine Ave, Cary, NC',    '{"lat":35.79,"lng":-78.78}', 4, 3.5, 1400, 'crawlspace',  0,     'MLS-100234'),
  ('lot',   'owned',   'active', 42000,  'Lot 7 Greenfield, Durham NC', '{"lat":36.01,"lng":-78.92}', NULL, NULL, 6000, 'slab',       0,     NULL),
  ('lot',   'partner', 'active', 55000,  'Lot 12 Sunrise, Raleigh NC',  '{"lat":35.80,"lng":-78.66}', NULL, NULL, 8500, 'crawlspace', 0,     NULL),
  ('lot',   'owned',   'active', 38000,  'Lot 3 Willow, Durham NC',     '{"lat":36.00,"lng":-78.93}', NULL, NULL, 2600, 'slab',       0,     NULL);
