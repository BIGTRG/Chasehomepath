import { assertCleanCopy } from '../compliance/copyGate.js';
import { COUNSELOR } from '../lib/counselor.js';

/**
 * Dispute letter templates — DETERMINISTIC, member-edited, member-sent.
 *
 * Maren drafts; the member reads, edits, signs, and sends. No letter leaves this system
 * on its own. Text is factual and cites the statute the member is relying on. It never
 * promises a deletion, a score, or a timeline (copy gate enforced at build time).
 *
 * Addresses verified 2026-09-13 against experian.com/help/dispute-credit,
 * equifax.com mail-in-credit-report-dispute, transunion.com dispute-your-credit/mail-or-phone.
 */
export const BUREAUS = {
  experian: {
    name: 'Experian',
    address: 'Experian\nP.O. Box 4500\nAllen, TX 75013',
    online: 'https://www.experian.com/disputes/main.html',
    phone: '888-397-3742',
  },
  equifax: {
    name: 'Equifax',
    address: 'Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374-0256',
    online: 'https://www.equifax.com/personal/credit-report-services/credit-dispute/',
    phone: '888-378-4329',
  },
  transunion: {
    name: 'TransUnion',
    address: 'TransUnion Consumer Solutions\nP.O. Box 2000\nChester, PA 19016-2000',
    online: 'https://www.transunion.com/credit-disputes/dispute-your-credit',
    phone: '800-916-8800',
  },
};

export const CFPB = { name: 'Consumer Financial Protection Bureau', online: 'https://www.consumerfinance.gov/complaint/', phone: '855-411-2372' };

/** Reasons the member can pick. Plain label for the screen; `claim` is the sentence in the letter. */
export const REASONS = {
  not_mine: {
    label: 'This account is not mine',
    claim: 'I do not recognize this account and did not open it. It does not belong to me.',
    ask: 'Please investigate and remove this account from my file.',
    evidence: ['Copy of government ID', 'Proof of address (utility bill or lease)', 'FTC identity theft report, if you filed one'],
  },
  paid_shows_balance: {
    label: 'I paid this, but it still shows a balance',
    claim: 'This account has been paid, yet it is reported with an outstanding balance.',
    ask: 'Please update the account to reflect a zero balance and paid status.',
    evidence: ['Proof of payment (statement, receipt, or bank record)', 'Any settlement or paid-in-full letter'],
  },
  wrong_balance: {
    label: 'The balance is wrong',
    claim: 'The balance reported on this account is not correct.',
    ask: 'Please verify the balance with the furnisher and correct it.',
    evidence: ['Most recent statement showing the correct balance'],
  },
  wrong_late: {
    label: 'It shows a late payment I made on time',
    claim: 'This account reports a late payment that I made on time.',
    ask: 'Please correct the payment history for this account.',
    evidence: ['Statement or bank record showing the on-time payment'],
  },
  too_old: {
    label: 'It is older than seven years',
    claim: 'This item is past the seven-year reporting period allowed under 15 U.S.C. § 1681c.',
    ask: 'Please remove this obsolete item from my file.',
    evidence: ['Any record showing the date of first delinquency'],
  },
  duplicate: {
    label: 'It is listed twice',
    claim: 'This debt appears more than once on my report, as separate accounts, for the same obligation.',
    ask: 'Please remove the duplicate entry so the debt appears once.',
    evidence: ['Copy of the report page showing both entries'],
  },
  closed_shows_open: {
    label: 'I closed it, but it shows open',
    claim: 'I closed this account, yet it is reported as open.',
    ask: 'Please update the account status to closed.',
    evidence: ['Closure confirmation from the creditor'],
  },
  identity_theft: {
    label: 'This came from identity theft',
    claim: 'This account was opened without my knowledge or consent as a result of identity theft.',
    ask: 'Please block this information under 15 U.S.C. § 1681c-2 and remove it from my file.',
    evidence: ['FTC identity theft report (IdentityTheft.gov)', 'Police report, if filed', 'Copy of government ID', 'Proof of address'],
  },
  other: {
    label: 'Something else is inaccurate',
    claim: 'The information reported for this account is inaccurate or incomplete, as described below.',
    ask: 'Please investigate and correct or remove the inaccurate information.',
    evidence: ['Any document that shows the correct information'],
  },
};

const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
const fmtDob = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }) : '[date of birth]');

function addressBlock(a) {
  if (!a || !a.line1) return '[your street address]\n[city, state ZIP]';
  return [a.line1, a.line2, `${a.city ?? ''}, ${a.state ?? ''} ${a.zip ?? ''}`.trim()].filter(Boolean).join('\n');
}

function header({ member, recipientAddress, date }) {
  return `${member.name}\n${addressBlock(member.address)}\nDate of birth: ${fmtDob(member.dob)}\n\n${fmtDate(date)}\n\n${recipientAddress}\n`;
}

function itemBlock(item) {
  const lines = [`Creditor or furnisher: ${item.creditor ?? '[creditor name]'}`, `Type of account: ${item.type ?? '[type]'}`];
  if (item.account_ref) lines.push(`Account number (as shown on report): ${item.account_ref}`);
  if (item.balance != null) lines.push(`Balance as reported: $${Number(item.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  return lines.join('\n');
}

function finish(body) {
  assertCleanCopy(body);
  return body;
}

/** Round 1: dispute to a bureau under FCRA § 611 (15 U.S.C. § 1681i). */
export function bureauDispute({ member, item, reasonCode, details, bureauKey, date = new Date() }) {
  const b = BUREAUS[bureauKey];
  const r = REASONS[reasonCode] ?? REASONS.other;
  const body = `${header({ member, recipientAddress: b.address, date })}
Re: Dispute of inaccurate information on my ${b.name} credit report

To whom it may concern:

I am writing to dispute the following item on my ${b.name} credit report. ${r.claim}${details ? `\n\n${details.trim()}` : ''}

${itemBlock(item)}

${r.ask} Under the Fair Credit Reporting Act, 15 U.S.C. § 1681i, you are required to conduct a reasonable reinvestigation of this dispute, generally within 30 days, and to send me written results. If the information cannot be verified, it must be deleted or corrected. Please also send me a free copy of my updated report when the reinvestigation is complete.

Enclosed are copies (not originals) of my identification and the documents supporting this dispute.

Sincerely,


${member.name}

Enclosures: ${['Copy of government-issued ID', 'Proof of current address', ...r.evidence.filter((e) => !/ID|address/i.test(e))].join('; ')}
`;
  return { kind: 'bureau_dispute', recipientKey: bureauKey, recipientName: b.name, recipientAddr: b.address, body: finish(body) };
}

/** Round 2 (item came back "verified"): method of verification request, 15 U.S.C. § 1681i(a)(6)(B)(iii) and (a)(7). */
export function movRequest({ member, item, bureauKey, priorSentAt, date = new Date() }) {
  const b = BUREAUS[bureauKey];
  const body = `${header({ member, recipientAddress: b.address, date })}
Re: Request for method of verification, prior dispute sent ${priorSentAt ? fmtDate(priorSentAt) : '[date]'}

To whom it may concern:

I disputed the item below and you reported it as verified. Under 15 U.S.C. § 1681i(a)(6)(B)(iii) and § 1681i(a)(7), I am requesting a description of the procedure you used to determine the accuracy and completeness of this information, including the business name, address, and telephone number of the furnisher you contacted. You are required to provide this within 15 days of receiving this request.

${itemBlock(item)}

I continue to dispute this item as inaccurate. If your reinvestigation relied only on an automated match with the furnisher's data rather than a review of the specific inaccuracy I described, I ask that you reopen the reinvestigation.

Sincerely,


${member.name}
`;
  return { kind: 'mov_request', recipientKey: bureauKey, recipientName: b.name, recipientAddr: b.address, body: finish(body) };
}

/** Direct dispute to the furnisher under FCRA § 623(a)(8) (15 U.S.C. § 1681s-2(a)(8)). */
export function furnisherDirect({ member, item, reasonCode, details, furnisherAddress, date = new Date() }) {
  const r = REASONS[reasonCode] ?? REASONS.other;
  const name = item.creditor ?? '[creditor name]';
  const addr = furnisherAddress || `${name}\nAttn: Credit Reporting Disputes\n[address from your statement or the creditor's website]`;
  const body = `${header({ member, recipientAddress: addr, date })}
Re: Direct dispute of information you furnished to the credit bureaus

To whom it may concern:

I am disputing information your company furnished about me to Experian, Equifax, and/or TransUnion. ${r.claim}${details ? `\n\n${details.trim()}` : ''}

${itemBlock(item)}

Under 15 U.S.C. § 1681s-2(a)(8) and 12 C.F.R. § 1022.43, you must investigate this direct dispute, review all relevant information I provide, and report the results to me within 30 days. If the information is inaccurate or cannot be verified, you must correct it with every consumer reporting agency you sent it to. ${r.ask}

Copies of my supporting documents are enclosed.

Sincerely,


${member.name}

Enclosures: ${r.evidence.join('; ')}
`;
  return { kind: 'furnisher_direct', recipientKey: 'furnisher', recipientName: name, recipientAddr: addr, body: finish(body) };
}

/** Debt validation to a collector under FDCPA § 809 (15 U.S.C. § 1692g). Strongest within 30 days of first contact. */
export function debtValidation({ member, item, collectorAddress, date = new Date() }) {
  const name = item.creditor ?? '[collection agency]';
  const addr = collectorAddress || `${name}\n[address from the collection notice]`;
  const body = `${header({ member, recipientAddress: addr, date })}
Re: Request for validation of debt

To whom it may concern:

I am requesting validation of the debt you claim I owe, under 15 U.S.C. § 1692g. This is not a refusal to pay; it is a request that you provide proof that the debt is valid and that you have the right to collect it.

${itemBlock(item)}

Please provide: the name and address of the original creditor; the amount of the debt and how it was calculated, including any interest or fees; a copy of the original signed agreement or other document showing I am responsible for this debt; proof that you own the debt or are authorized to collect it; and your license to collect in my state, if one is required.

Until you provide validation, please cease collection activity as required by § 1692g(b), and do not report or continue to report this debt to any consumer reporting agency without noting that it is disputed, as required by 15 U.S.C. § 1692e(8).

Sincerely,


${member.name}
`;
  return { kind: 'debt_validation', recipientKey: 'furnisher', recipientName: name, recipientAddr: addr, body: finish(body) };
}

/** CFPB complaint text the member pastes into consumerfinance.gov/complaint. Online only. */
export function cfpbComplaint({ member, item, bureauKey, history, date = new Date() }) {
  const b = bureauKey && BUREAUS[bureauKey];
  const against = b ? b.name : item.creditor ?? '[company]';
  const body = `Complaint against: ${against}
Filed by: ${member.name}, ${fmtDate(date)}

What happened:
I disputed inaccurate information on my credit report and the company did not resolve it as required by the Fair Credit Reporting Act.

${itemBlock(item)}

Timeline:
${(history ?? []).map((h) => `- ${h}`).join('\n') || '- [dates you sent each letter and what came back]'}

What I believe is wrong:
${REASONS.other.claim}

What would resolve this:
Correct or remove the inaccurate information, and send me written confirmation and an updated copy of my report.

I have copies of every letter, the certified mail receipts, and the responses I received, and can upload them with this complaint.
`;
  return { kind: 'cfpb_complaint', recipientKey: 'cfpb', recipientName: CFPB.name, recipientAddr: null, body: finish(body) };
}

/** Maren's plain-language checklist for sending. Shown next to every letter. */
export function sendingSteps(kind) {
  if (kind === 'cfpb_complaint') {
    return [
      `Open ${CFPB.online} and choose "Credit reporting".`,
      'Paste this text into the complaint. Upload copies of your letters, receipts, and the bureau responses.',
      'Come back here and mark it sent. The company must respond to the CFPB, usually within 15 days.',
    ];
  }
  return [
    'Read it once more. Change anything that is not exactly your situation.',
    'Sign it with your name below. That is your signature on this letter.',
    'Print it, or save it as a PDF. Add copies of your ID, proof of address, and the documents listed.',
    'Send it certified mail with return receipt, and keep the receipt number. Or use the bureau\'s online portal and copy the text in.',
    `Mark it sent here and ${COUNSELOR.name} starts the 30-day clock.`,
  ];
}
