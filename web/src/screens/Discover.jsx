import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { COUNSELOR } from '../brand.js';

// Onboarding v2, step 1 (Deon, Sep 12): the video and the account form on one screen.
// Terms sit inside the form and must be scrolled to the end before the button turns on.
// Creating the account signs you in; the next screen is credit monitoring.
const VIDEO_SRC = '/media/how-it-works.mp4';
const VIDEO_POSTER = '/media/how-it-works-poster.jpg';

const AGREEMENTS = [
  ['What this is', 'CHASE HomePath is homeownership education and planning by TRG Tech Link. We teach, plan, and monitor with you. We are not a credit repair organization, a lender, or a law firm, and we do not promise any credit or loan outcome.'],
  ['Your counselor', `${COUNSELOR.name} is a virtual counselor built by CHASE HomePath, not a person. She speaks only from your own file. Rate, loan-term, and legal questions are handed to a licensed person.`],
  ['Credit report authorization', 'You authorize CHASE HomePath and its credit-monitoring partner to obtain your consumer credit report so it can be used in your plan. This is a soft inquiry that does not lower your score.'],
  ['Your data', 'Your data is never sold. Documents you upload are encrypted at rest and shared only with the team you approve. You can export or delete your account from Billing at any time.'],
  ['Fees', 'Your plan is a monthly fee you can cancel any time. One-on-one counseling is a separate per-session fee. No fee is charged for disputing or improving credit; you send your own disputes and we help you prepare them.'],
  ['Messages', 'You agree to receive account, scheduling, and training alerts by email and, if you give a mobile number, by text. Reply STOP to end texts.'],
  ['Terms and Privacy', 'By creating an account you agree to the full Terms of Service and Privacy Policy, linked below the form. They say the same things in more detail.'],
];

export default function Discover() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [scrolled, setScrolled] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const termsRef = useRef(null);
  const formRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const el = termsRef.current;
    if (!el) return undefined;
    const onScroll = () => { if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolled(true); };
    onScroll();
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (!scrolled || !agreed) return;
    setError(null);
    setBusy(true);
    try {
      await register({ name: form.name, email: form.email, phone: form.phone || undefined, password: form.password, consent: { terms: true, dataNeverSold: true } });
      navigate('/start', { replace: true });
    } catch (err) {
      setError(err.details?.[0]?.message || err.message || 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      {playing ? (
        <video className="vid vid-player" src={VIDEO_SRC} poster={VIDEO_POSTER} controls autoPlay playsInline preload="metadata" />
      ) : (
        <button type="button" className="vid vid-btn" onClick={() => setPlaying(true)} aria-label="Play: how CHASE HomePath works, about two minutes" style={{ backgroundImage: `url(${VIDEO_POSTER})` }}>
          <span className="play" aria-hidden>&#9654;</span>
        </button>
      )}

      <h1 className="h1">Own a home sooner than you think</h1>
      <p className="sub" style={{ fontSize: 14, lineHeight: 1.6 }}>
        Watch the two-minute walkthrough, then create your account below. {COUNSELOR.name}, your counselor, meets you on video today.
      </p>

      <div className="steps-strip" aria-label="What happens next">
        <span><b>1</b> Account</span><span><b>2</b> Credit monitoring</span><span><b>3</b> Documents</span><span><b>4</b> Meet {COUNSELOR.name}</span><span><b>5</b> Your plan</span>
      </div>

      <button type="button" className="btn" style={{ marginTop: 6 }} onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Create your account</button>
      <div className="gy" style={{ marginTop: 10 }}>Free to start. No credit impact to look. No one calls unless you ask.</div>

      <form onSubmit={onSubmit} ref={formRef} className="card" style={{ marginTop: 18, scrollMarginTop: 12 }}>
        <div className="h2" style={{ marginTop: 0 }}>Create your account</div>
        {error && <div className="error">{error}</div>}
        <div className="field"><label htmlFor="name">Full name</label><input id="name" value={form.name} onChange={set('name')} autoComplete="name" required /></div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></div>
        <div className="field"><label htmlFor="phone">Mobile</label><input id="phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="For training alerts" /></div>
        <div className="field"><label htmlFor="password">Create password</label><input id="password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={10} /><div className="mfa-hint" style={{ marginTop: 6 }}>At least 10 characters.</div></div>

        <div className="lbl" style={{ marginTop: 4 }}>Agreements, read to the end</div>
        <div className={`terms-box ${scrolled ? 'read' : ''}`} ref={termsRef} tabIndex={0} aria-label="Agreements">
          {AGREEMENTS.map(([h, p]) => (<div key={h}><div className="n" style={{ fontSize: 13 }}>{h}</div><p>{p}</p></div>))}
          <p className="s">Full documents: <Link to="/terms">Terms of Service</Link>, <Link to="/privacy">Privacy Policy</Link>. Questions: support@chasehomepath.com.</p>
        </div>
        {!scrolled && <div className="s" style={{ margin: '6px 0 8px' }}>Scroll to the end of the agreements to continue.</div>}

        <label className="consent" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={agreed} disabled={!scrolled} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I have read the agreements above and I agree to the Terms and Privacy Policy. My data is never sold.</span>
        </label>

        <button className="btn" type="submit" disabled={busy || !agreed || !scrolled}>{busy ? 'Creating your account…' : 'Create account and continue'}</button>
      </form>

      <p className="center-link">Already a member? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
