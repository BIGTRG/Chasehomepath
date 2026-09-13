/* global FormData, Blob */
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Print-and-mail adapter. Takes a finished, member-signed letter PDF and hands it to a
 * mail house for USPS Certified Mail with electronic return receipt. The member pressed
 * the button; we are the courier, never the author or the sender of record.
 *
 * Interface:
 *   name
 *   async quote({ pages })                       -> { amountCents, breakdown: [{ label, amountCents }] }
 *   async send({ letterId, pdf, to, from, description }) -> { ref, status, trackingNumber, expectedDelivery, costCents }
 *   async status({ ref })                        -> { status, trackingNumber, deliveredAt, proofOfDeliveryUrl }
 *   verifyWebhook(rawBody, signature)            -> { ref, status, trackingNumber, deliveredAt, proofOfDeliveryUrl } | throws
 * Statuses: queued | printed | in_transit | delivered | returned | failed
 *
 * Swappable via MAIL_ADAPTER=mock|lob. Prices are the provider's own, passed through at cost.
 */

// Lob public rate card, checked 2026-09-13 (help.lob.com/print-and-mail/ready-to-get-started/pricing-details):
// letter print+postage from $0.828, Certified Mail with electronic return receipt $9.86, extra pages $0.10.
const LOB_RATES = { letterCents: 83, certifiedErrCents: 986, extraPageCents: 10 };

function isoDay(d) { return d.toISOString().slice(0, 10); }
function businessDaysOut(n) { const d = new Date(); let k = 0; while (k < n) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) k += 1; } return d; }

function quoteFromRates(rates, pages) {
  const extra = Math.max(0, pages - 1) * rates.extraPageCents;
  const breakdown = [
    { label: 'Print and first-class postage', amountCents: rates.letterCents + extra },
    { label: 'USPS Certified Mail with electronic return receipt', amountCents: rates.certifiedErrCents },
  ];
  return { amountCents: breakdown.reduce((s, b) => s + b.amountCents, 0), breakdown };
}

function createMockMailAdapter() {
  const pieces = new Map();
  return {
    name: 'mock',
    async quote({ pages = 1 }) { return quoteFromRates(LOB_RATES, pages); },
    async send({ letterId, pdf, pages = 1 }) {
      if (!pdf || pdf.length === 0) throw new Error('No PDF to mail');
      const ref = `mail_mock_${letterId.slice(0, 8)}`;
      const trackingNumber = `9407 1000 0000 ${letterId.replace(/\D/g, '').slice(0, 4).padEnd(4, '0')} ${String(pieces.size + 1).padStart(4, '0')} 00`;
      const rec = { ref, status: 'in_transit', trackingNumber, expectedDelivery: isoDay(businessDaysOut(5)), costCents: (await this.quote({ pages })).amountCents };
      pieces.set(ref, rec);
      return rec;
    },
    async status({ ref }) { return pieces.get(ref) ?? { ref, status: 'in_transit' }; },
    verifyWebhook(rawBody) {
      const e = JSON.parse(rawBody.toString());
      return { ref: e.ref, status: e.status, trackingNumber: e.trackingNumber ?? null, deliveredAt: e.deliveredAt ?? null, proofOfDeliveryUrl: e.proofOfDeliveryUrl ?? null };
    },
  };
}

/** Lob: https://docs.lob.com/#tag/Letters. Basic auth with the secret key; multipart file upload. */
function createLobAdapter() {
  const key = process.env.LOB_API_KEY;
  if (!key) throw new Error('LOB_API_KEY is required when MAIL_ADAPTER=lob');
  const auth = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
  const base = 'https://api.lob.com/v1';
  const mapStatus = (ev) => ({
    'letter.created': 'queued', 'letter.rendered_pdf': 'queued', 'letter.mailed': 'printed',
    'letter.in_transit': 'in_transit', 'letter.in_local_area': 'in_transit', 'letter.processed_for_delivery': 'in_transit',
    'letter.delivered': 'delivered', 'letter.re-routed': 'in_transit', 'letter.returned_to_sender': 'returned',
    'letter.certified.delivered': 'delivered', 'letter.certified.pickup_available': 'in_transit', 'letter.certified.issue': 'returned',
  }[ev] ?? 'in_transit');
  return {
    name: 'lob',
    async quote({ pages = 1 }) { return quoteFromRates(LOB_RATES, pages); },
    async send({ letterId, pdf, pages = 1, to, from, description }) {
      const form = new FormData();
      form.set('description', description ?? `Dispute letter ${letterId}`);
      form.set('to[name]', to.name); form.set('to[address_line1]', to.line1); if (to.line2) form.set('to[address_line2]', to.line2);
      form.set('to[address_city]', to.city); form.set('to[address_state]', to.state); form.set('to[address_zip]', to.zip);
      form.set('from[name]', from.name); form.set('from[address_line1]', from.line1); if (from.line2) form.set('from[address_line2]', from.line2);
      form.set('from[address_city]', from.city); form.set('from[address_state]', from.state); form.set('from[address_zip]', from.zip);
      form.set('color', 'false'); form.set('double_sided', 'false'); form.set('address_placement', 'insert_blank_page');
      form.set('mail_type', 'usps_first_class'); form.set('extra_service', 'certified_return_receipt');
      form.set('metadata[letter_id]', letterId);
      form.set('file', new Blob([pdf], { type: 'application/pdf' }), 'letter.pdf');
      const res = await fetch(`${base}/letters`, { method: 'POST', headers: { authorization: auth }, body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(`Lob: ${body?.error?.message ?? res.status}`);
      return { ref: body.id, status: 'queued', trackingNumber: body.tracking_number ?? null, expectedDelivery: body.expected_delivery_date ?? isoDay(businessDaysOut(6)), costCents: (await this.quote({ pages })).amountCents };
    },
    async status({ ref }) {
      const res = await fetch(`${base}/letters/${ref}`, { headers: { authorization: auth } });
      const body = await res.json();
      if (!res.ok) throw new Error(`Lob: ${body?.error?.message ?? res.status}`);
      const last = body.tracking_events?.at(-1);
      return { ref, status: last ? mapStatus(`letter.${last.name}`) : 'queued', trackingNumber: body.tracking_number ?? null, deliveredAt: last?.name === 'delivered' ? last.time : null, proofOfDeliveryUrl: body.return_receipt_url ?? null };
    },
    verifyWebhook(rawBody, signature, timestamp) {
      const secret = process.env.LOB_WEBHOOK_SECRET;
      if (secret) {
        const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString()}`).digest('hex');
        if (expected !== signature) throw new Error('Bad webhook signature');
      }
      const e = JSON.parse(rawBody.toString());
      return { ref: e.body?.id ?? e.reference_id, status: mapStatus(e.event_type?.id), trackingNumber: e.body?.tracking_number ?? null, deliveredAt: e.event_type?.id?.endsWith('delivered') ? e.date_created : null, proofOfDeliveryUrl: e.body?.return_receipt_url ?? null };
    },
  };
}

let cached;
export function getMailAdapter() {
  if (cached) return cached;
  switch (env.adapters.mail) {
    case 'mock': cached = createMockMailAdapter(); break;
    case 'lob': cached = createLobAdapter(); break;
    default: throw new Error(`Unknown MAIL_ADAPTER: ${env.adapters.mail}`);
  }
  return cached;
}
