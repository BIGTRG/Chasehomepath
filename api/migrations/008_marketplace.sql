-- 008_marketplace.sql
-- Marketplace (spec §3, §8 source-labeling, Phases 7–8).
-- Compliance: every listing carries its source (owned/optioned/partner/mls) — never hidden.

CREATE TABLE house_plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  beds           smallint CHECK (beds >= 0),
  baths          numeric(3,1) CHECK (baths >= 0),        -- 2.5 baths etc.
  sqft           integer CHECK (sqft >= 0),
  foundation     text,
  est_build_low  numeric(14,2) CHECK (est_build_low >= 0),
  est_build_high numeric(14,2) CHECK (est_build_high >= 0),
  build_months   smallint CHECK (build_months >= 0),
  priority_tags  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE TRIGGER house_plans_set_updated_at BEFORE UPDATE ON house_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE listings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                text NOT NULL CHECK (type IN ('house','lot','plan')),
  source              text NOT NULL CHECK (source IN ('owned','optioned','partner','mls')),
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','pending_approval','active','retired')),
  price               numeric(14,2) CHECK (price >= 0),
  address             text,
  geo                 jsonb,        -- { lat, lng } or GeoJSON point
  beds                smallint CHECK (beds >= 0),
  baths               numeric(3,1) CHECK (baths >= 0),
  sqft                integer CHECK (sqft >= 0),
  foundation          text,
  remaining_work_cost numeric(14,2) CHECK (remaining_work_cost >= 0),
  partner_id          uuid REFERENCES partners(id),   -- set when source = 'partner'
  mls_ref             text,                           -- set when source = 'mls'
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX listings_type_status_idx ON listings (type, status) WHERE deleted_at IS NULL;
CREATE INDEX listings_source_idx ON listings (source) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX listings_mls_ref_unique ON listings (mls_ref)
  WHERE mls_ref IS NOT NULL AND deleted_at IS NULL;   -- dedup guard for MLS ingestion (§Phase 8)
CREATE TRIGGER listings_set_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Plan-to-lot fit: which house_plan fits which lot listing.
CREATE TABLE lot_plan_fit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_listing_id  uuid NOT NULL REFERENCES listings(id),
  house_plan_id   uuid NOT NULL REFERENCES house_plans(id),
  fits            boolean NOT NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE UNIQUE INDEX lot_plan_fit_unique
  ON lot_plan_fit (lot_listing_id, house_plan_id) WHERE deleted_at IS NULL;
CREATE TRIGGER lot_plan_fit_set_updated_at BEFORE UPDATE ON lot_plan_fit
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Per-member computed enrichment (est monthly, assistance applied, plan fit).
CREATE TABLE listing_enrichment (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id         uuid NOT NULL REFERENCES listings(id),
  member_id          uuid NOT NULL REFERENCES members(id),
  est_monthly        numeric(14,2),
  assistance_matched jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan_fit           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE UNIQUE INDEX listing_enrichment_unique
  ON listing_enrichment (listing_id, member_id) WHERE deleted_at IS NULL;
CREATE TRIGGER listing_enrichment_set_updated_at BEFORE UPDATE ON listing_enrichment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
