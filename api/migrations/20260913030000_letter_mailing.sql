-- Mail-it-for-me (print-and-mail service) and proof-of-mailing records for dispute letters.
ALTER TABLE dispute_letters
  ADD COLUMN IF NOT EXISTS mail_provider     text,
  ADD COLUMN IF NOT EXISTS mail_ref          text,
  ADD COLUMN IF NOT EXISTS mail_status       text CHECK (mail_status IN ('queued','printed','in_transit','delivered','returned','failed')),
  ADD COLUMN IF NOT EXISTS mail_cost_cents   integer CHECK (mail_cost_cents >= 0),
  ADD COLUMN IF NOT EXISTS expected_delivery date,
  ADD COLUMN IF NOT EXISTS payment_id        uuid REFERENCES payments(id);

ALTER TABLE dispute_letters DROP CONSTRAINT IF EXISTS dispute_letters_sent_method_check;
ALTER TABLE dispute_letters ADD CONSTRAINT dispute_letters_sent_method_check CHECK (sent_method IN
  ('certified_mail','mail','online','fax','mail_service'));

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments ADD CONSTRAINT payments_kind_check CHECK (kind IN ('subscription','session','group','mail'));

ALTER TABLE member_documents DROP CONSTRAINT IF EXISTS member_documents_doc_type_check;
ALTER TABLE member_documents ADD CONSTRAINT member_documents_doc_type_check CHECK (doc_type IN
  ('photo_id','pay_stub_1','pay_stub_2','employment','co_applicant_id',
   'tax_return_1','tax_return_2','w2_1','w2_2','other',
   'letter_copy','mail_proof'));

-- Every piece of proof tied to a letter: the signed copy, the certified receipt, the return receipt, delivery proof.
CREATE TABLE IF NOT EXISTS letter_proofs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id   uuid NOT NULL REFERENCES dispute_letters(id),
  member_id   uuid NOT NULL REFERENCES members(id),
  document_id uuid NOT NULL REFERENCES member_documents(id),
  kind        text NOT NULL CHECK (kind IN ('signed_letter','certified_receipt','return_receipt','delivery_proof','other')),
  source      text NOT NULL DEFAULT 'member' CHECK (source IN ('member','system','provider')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS letter_proofs_letter ON letter_proofs (letter_id) WHERE deleted_at IS NULL;

-- The switch. Operators flip it; the API refuses the mail path while it is off.
INSERT INTO billing_settings (key, value) VALUES
  ('mail_service', '{"enabled": false, "name": "Mail it for me", "carrier": "USPS Certified Mail with electronic return receipt"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
