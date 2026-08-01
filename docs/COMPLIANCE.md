# CHASE HomePath — Compliance Memo

Prepared 2026-07-30. Research-based summary with statute cites; not legal advice. Have a NC-licensed
attorney review before scaling paid credit services or the marketplace beyond CHASE-owned inventory.
Operating entity assumed: TRG Tech Link (confirm exact legal entity + state of formation before
publishing legal pages externally). Initial corridor: North Carolina.

## 1. CROA — Credit Repair Organizations Act (15 U.S.C. §§ 1679–1679j)

**Exposure.** A "credit repair organization" is anyone who, in return for money or other valuable
consideration, provides services to improve a consumer's credit record, history, or rating — or
advice about doing so. Courts read this broadly: "free" marketing does not defeat coverage where any
payment exists (Stout v. FreeScore, 9th Cir. 2014), and 501(c)(3) paperwork alone does not exempt an
entity that operates for profit (Zimmerman v. Cambridge Credit, 409 F.3d 473 (1st Cir. 2005);
Polacsek v. Debticated, D. Md. 2005). CHASE HomePath's credit track (dispute assistance, paydown
plans, score improvement guidance) plus ANY fee collected from the member makes CRO status the safe
assumption.

**Requirements if covered (build/ops posture):**
- **No advance fees** — cannot charge before the service is *fully performed* (§ 1679b(b)).
- **Written contract** signed by the member with payment terms, full service description, guarantees,
  completion estimate, name/address, and the bold-face 3-business-day cancellation notice next to the
  signature line (§ 1679d), plus a separate Notice of Cancellation form (§ 1679e).
- **Pre-contract disclosure** — the exact "Consumer Credit File Rights Under State and Federal Law"
  statement, provided as a separate document before signing (§ 1679c).
- **No untrue/misleading statements**, no advice to make untrue statements, no advising to dispute
  accurate information (§ 1679b(a)) — already enforced server-side (403 on accurate-item disputes).
- Waivers of CROA rights are void (§ 1679f).

**Current architecture keeps us on the right side:**
- SmartCredit affiliate model: the member buys their own monitoring subscription directly from
  SmartCredit/ConsumerDirect. That fee is the vendor's, not ours.
- Disputes are member-initiated, accurate items cannot be disputed (hard 403), no outcome promises
  anywhere in copy, score withheld pending consultation is presented as sequencing, not a guarantee.

**FLAG (needs Deon/attorney decision):** the Qualify screen authorization says "I understand a fee
applies" for the credit pull. If that fee is paid to CHASE HomePath while we also provide credit
improvement services, it risks being an advance fee under § 1679b(b) and triggers the full CROA
contract/disclosure stack plus the NC bond (below). Options: (a) fee flows only to the credit
provider as a pass-through clearly labeled as the vendor's charge; (b) drop the fee; (c) adopt the
full CROA contract + disclosure + 3-day-cancel flow and NC bond before charging. Until decided, the
production copy should avoid promising or collecting platform fees for the credit track.

## 2. North Carolina Credit Repair Services Act (N.C.G.S. §§ 66-220 to 66-226)

- Applies to any "credit repair business" operating on NC consumers for compensation.
- **§ 66-222**: $10,000 surety bond or trust account required BEFORE doing business.
- **§ 66-223**: no advance fees; no untrue or misleading statements.
- **§ 66-224**: written contract with required disclosures; 3-day cancellation right.
- **§ 66-225**: violations let the consumer void the contract, recover ALL sums paid, plus damages
  and attorney's fees. Treble-damage exposure via N.C.G.S. § 75-1.1 (UDAP) is also realistic.
- No CSO registration requirement in NC currently, but the bond is mandatory if compensated.
- **Posture:** while the credit track is uncompensated (SmartCredit affiliate model, no platform fee),
  the statute's compensation trigger is arguably not met — but if ANY fee is charged (see CROA flag),
  post the $10k bond first (cost ~$100–$1,000/yr).

## 3. FCRA (15 U.S.C. § 1681 et seq.)

- Members access their own reports via consented SmartCredit enrollment — valid permissible purpose
  (§ 1681b(a)(2), written instructions of the consumer).
- Disputes: members exercise their own § 1611/§ 1681i rights (CRA reinvestigation, 30 days) and
  § 1681s-2 direct furnisher disputes. The app assists; it does not fabricate or automate frivolous
  disputes (bulk/frivolous disputes can be terminated by CRAs and draw CFPB attention).
- We must always disclose that consumers can dispute inaccurate information themselves, for free,
  directly with the bureaus (also part of the CROA § 1679c statement). Included in Privacy/Terms and
  the credit-track UI ("You're in control" screen already frames this).
- We are not a consumer reporting agency and must not furnish or resell report data to third parties.

## 4. GLBA / FTC Safeguards Rule (16 C.F.R. Part 314)

- CHASE HomePath is very likely a "financial institution" under the Rule: credit counselors/financial
  advisors are a listed example, and "finders" that bring buyers and sellers together were added in
  the 2021 amendments. Compliance was due June 2023 for covered entities; breach reporting to the FTC
  (unencrypted info of ≥500 consumers, publicly databased) effective May 13, 2024.
- **Under 5,000 consumers** we qualify for the small-institution exemption from the WRITTEN risk
  assessment, incident response plan, and annual board report (16 C.F.R. § 314.6) — but the
  substantive safeguards still apply.
- Current controls: TLS everywhere, AES-256 field encryption for report data, bcrypt, JWT with
  refresh rotation, role-scoped APIs, private uploads volume, audit log, least-privilege DB.
- **FLAGS:** (a) designate a Qualified Individual (Deon or delegate) in writing; (b) MFA for operator
  console staff — not yet implemented; documented as a gap with compensating controls (strong
  passwords, IP-logged audit trail); build TOTP MFA for staff next; (c) vendor oversight — SmartCredit,
  Plaid, and mail provider agreements should include safeguards commitments when signed.
- NC breach notification: N.C.G.S. § 75-65 requires notice to affected NC residents and the AG.

## 5. RESPA Section 8 (12 U.S.C. § 2607; Reg X 12 C.F.R. § 1024.14–.15)

- Applies to referrals of settlement services involving federally related mortgage loans — squarely
  relevant to the Team tab (lenders, attorneys, inspectors) and Marketplace partner listings.
- **Prohibited:** receiving anything of value under an agreement to refer settlement-service business
  (per-closing referral fees from lenders/title/attorneys). No "small fee" exception; CFPB pursues
  marketing-services agreements that are disguised referral fees.
- **Permitted:** bona fide compensation reasonably related to services/goods actually provided (flat
  advertising fees not tied to closings, per the HUD CLO policy statements — list multiple providers,
  no steering, fee independent of whether a loan closes); affiliated business arrangements ONLY with
  the ABA disclosure, no required use, and returns limited to ownership share (§ 1024.15).
- **Posture:** partner placement is a flat subscription/advertising fee, never per-closing, never
  volume-based. If TRG ever affiliates with a lender/title company, ABA disclosure gets added to the
  flow before any referral.

## 6. NC Real Estate License Law (N.C.G.S. Chapter 93A)

- Brokerage = listing/selling/negotiating real estate *for others* *for compensation* (§ 93A-2(a)).
  H.B. 797 (eff. Oct. 1, 2025) also classifies residential wholesaling as brokerage — no investor or
  cash-buyer exemption.
- **CHASE-owned homes:** owner exemption (§ 93A-2(c)(1)) — an entity selling property it owns, in the
  regular course of managing its investment, needs no license BUT must give all parties a written
  disclosure: not licensed, the specific exemption relied on, and the owner's legal name and address.
  → build this disclosure into any CHASE-owned purchase flow documents.
- **Partner / MLS listings:** display is advertising by the listing broker (IDX-style). The platform
  must not negotiate for others or take compensation contingent on a sale without a licensed NC
  broker. If the marketplace evolves into matching + negotiating, affiliate a NC broker-in-charge or
  keep monetization to flat advertising fees.
- NC is an attorney-closing state — closings run through licensed NC attorneys (Team tab already
  models attorneys as partners).

## 7. Housing counseling / education

- HUD counselor certification is only required for HUD-program counseling. Private pre-purchase
  education is fine; never claim "HUD-approved" or "HUD-certified" unless actually approved.
- Assistance-program estimates in the app are estimates from program data; final eligibility rests
  with each program administrator — stated in Terms.

## 8. General

- FTC Act § 5 / N.C.G.S. § 75-1.1 (UDAP): no outcome promises, no fake urgency, source labeling on
  listings — all enforced in copy and code.
- E-SIGN/UETA: consent checkboxes with timestamped audit records; e-sign vendor adapter for contracts.
- CAN-SPAM: transactional email from support@chasehomepath.com; any marketing mail needs unsubscribe +
  physical address. Comms otherwise stay in-app by design.
- COPPA: 18+ service; no child-directed features.

## Blockers / decisions for Deon
1. Credit-pull fee wording and flow (CROA advance-fee risk) — pick option (a) pass-through, (b) no
   fee, or (c) full CROA stack + NC $10k bond.
2. Confirm exact legal entity name/state for Terms & Privacy.
3. NC $10k surety bond — required before charging NC consumers anything for credit services.
4. Marketplace monetization rule: flat advertising fees only; no per-closing referral fees (RESPA);
   licensed broker partner before any negotiate-for-others features (NCGS 93A).
5. Operator console MFA (GLBA Safeguards) — approve build.
