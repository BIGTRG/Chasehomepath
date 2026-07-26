import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { agent as agentApi } from '../api/client.js';

// AI agent (spec §4.10): chat over the member's own file. Rate/term/legal questions
// escalate to a licensed human — the agent says it can't answer and offers to connect.
export default function Agent() {
  const navigate = useNavigate();
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
      <button className="btn secondary back" onClick={() => navigate('/')}>← Plan</button>
      <h1 className="h1">Ask CHASE</h1>

      <div className="card thread" style={{ maxHeight: 420 }}>
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
