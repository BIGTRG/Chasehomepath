import { useRef, useState, useEffect } from 'react';
import ScreenTop from '../components/ScreenTop.jsx';
import { agent as agentApi } from '../api/client.js';

// Walkthrough screen 9: 24/7, answers about the member's own file — and escalates
// anything licensed (rates, terms) to a human. (spec §4.10)
export default function Agent() {
  const [messages, setMessages] = useState([
    { from: 'agent', text: "Hi! Ask me anything about your plan, credit, money, or learning. For rates, loan terms, or legal questions I'll connect you with your team." },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function ask(e) {
    e.preventDefault();
    const question = draft.trim();
    if (!question || busy) return;
    setDraft('');
    setMessages((m) => [...m, { from: 'me', text: question }]);
    setBusy(true);
    try {
      const res = await agentApi.ask(question);
      setMessages((m) => [...m, { from: 'agent', text: res.answer, escalated: res.escalated }]);
    } catch (err) {
      setMessages((m) => [...m, { from: 'agent', text: err.message || 'Something went wrong.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <ScreenTop
        title="HomePath agent"
        sub={<span style={{ color: 'var(--green)' }}>Always on</span>}
        right={<span className="av" aria-hidden>⌂</span>}
      />

      <div className="thread" style={{ maxHeight: 440, marginBottom: 4 }}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.from === 'me' ? 'mine' : 'theirs'} ${m.escalated ? 'escalated' : ''}`}>
            {m.text}
            {m.escalated && <div className="escalate-tag">→ Your specialist can help with this</div>}
          </div>
        ))}
        {busy && <div className="bubble theirs">…</div>}
        <div ref={endRef} />
      </div>

      <form className="msg-form" onSubmit={ask}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about your plan…" />
        <button className="btn send-btn" type="submit" disabled={busy}>Ask</button>
      </form>
    </div>
  );
}
