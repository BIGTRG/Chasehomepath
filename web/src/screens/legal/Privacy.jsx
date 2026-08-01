import LegalLayout from './LegalLayout.jsx';

// Custom Privacy Policy for CHASE HomePath — GLBA-style notice, written against
// docs/COMPLIANCE.md. Core promise from the product spec: your data is never sold.
export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="July 30, 2026">
      <p className="legal-lede">
        The short version: we collect only what your homeownership plan needs, we protect it with
        encryption, <strong>we never sell your data</strong>, and we never share it with third
        parties for their marketing.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account:</strong> email, phone (optional), password (stored only as a secure hash).</li>
        <li><strong>Intake:</strong> household income, target area, co-applicant info you choose to add.</li>
        <li><strong>Credit data:</strong> with your explicit authorization, credit report information
          from the credit monitoring account you open with our third-party provider. Report contents
          are encrypted (AES-256) at rest.</li>
        <li><strong>Financial connections:</strong> if you link a bank account, balances and
          transactions via our data provider — credentials go to the provider, never to us.</li>
        <li><strong>Documents:</strong> files you photograph or upload (ID, pay stubs), stored in
          private storage and visible only to you and the staff working your plan.</li>
        <li><strong>Usage and security data:</strong> device/browser info and activity logs kept for
          security auditing.</li>
      </ul>

      <h2>2. What we use it for</h2>
      <ul>
        <li>Building and running your plan (the only reason this Service exists).</li>
        <li>Preparing your credit review and consultation.</li>
        <li>Matching you with listings and assistance-program estimates.</li>
        <li>Security, fraud prevention, and legal compliance.</li>
      </ul>
      <p>We do not use your data for third-party advertising, and we do not train marketing profiles on it.</p>

      <h2>3. What we share — and with whom</h2>
      <ul>
        <li><strong>Service providers</strong> that operate parts of the platform under contract:
          credit monitoring (with your authorization), bank data connection, email delivery, and
          hosting. Each receives only what its function requires.</li>
        <li><strong>Your team.</strong> Staff assigned to your plan see your plan data. Independent
          partner professionals (lender, attorney, inspector, agent) see your information only when
          you choose to engage them, and only what that engagement needs.</li>
        <li><strong>Legal.</strong> When required by law, subpoena, or to protect members from fraud.</li>
        <li><strong>Never:</strong> sold to anyone; shared with data brokers; shared for third-party
          marketing.</li>
      </ul>

      <h2>4. How we protect it</h2>
      <ul>
        <li>TLS encryption for all traffic; AES-256 encryption at rest for credit report data.</li>
        <li>Role-based access — staff see only members assigned to them; partners see only their own
          engagements.</li>
        <li>Audit logging of access to sensitive records.</li>
        <li>An information security program maintained under the FTC Safeguards Rule (16 C.F.R. Part
          314), with a designated responsible individual.</li>
      </ul>

      <h2>5. Your choices and rights</h2>
      <ul>
        <li><strong>Access and correction:</strong> your plan data is visible in the app; email
          support@chasehomepath.com for a copy of your records or corrections.</li>
        <li><strong>Credit authorization:</strong> pulling your credit data always requires your
          explicit authorization first, and you can revoke it for future refreshes at any time.</li>
        <li><strong>Deletion:</strong> close your account and we delete or de-identify your personal
          data, except records we must keep by law (for example, consent and dispute records).</li>
        <li><strong>Email:</strong> service emails are limited to receipts, confirmations, and
          security notices.</li>
      </ul>

      <h2>6. Breach notification</h2>
      <p>
        If a security incident affects your unencrypted personal information, we will notify you and
        the appropriate regulators as required by the FTC Safeguards Rule and N.C. Gen. Stat.
        § 75-65, without unreasonable delay.
      </p>

      <h2>7. Retention</h2>
      <p>
        We keep plan and credit records while your account is active and for the period required by
        federal and North Carolina law afterward, then delete or de-identify them.
      </p>

      <h2>8. Children</h2>
      <p>The Service is for adults 18 and over. We do not knowingly collect children's data.</p>

      <h2>9. Changes and contact</h2>
      <p>
        Material changes to this policy will be announced in the app before they take effect.
        Questions: TRG Tech Link — CHASE HomePath, support@chasehomepath.com.
      </p>
    </LegalLayout>
  );
}
