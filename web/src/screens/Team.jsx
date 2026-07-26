import { useEffect, useRef, useState } from 'react';
import { team as teamApi } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';

// Team (spec §4.12): the assigned people, in-app contact ONLY (no phone/email),
// responsiveness rating. Messaging flows through the in-app thread.
export default function Team() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  async function loadAll() {
    try {
      const t = await teamApi.mine();
      setData(t);
      const m = await teamApi.messages(t.threadId);
      setMessages(m.messages);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { loadAll(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    const body = draft;
    setDraft('');
    try {
      await teamApi.send(data.threadId, body);
      const m = await teamApi.messages(data.threadId);
      setMessages(m.messages);
    } catch (err) {
      setError(err.message);
    }
  }

  async function rate(userId, score) {
    await teamApi.rate(userId, score);
    loadAll();
  }

  if (error) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <div className="content">
      <h1 className="h1">Your team</h1>
      <p className="sub">Your 7–9 people. Reach them here — all messaging stays in the app.</p>

      {data.team.length === 0 && (
        <div className="card muted-card">Your team is being assembled. Check back soon.</div>
      )}

      {data.team.map((m) => (
        <div className="card" key={m.assignmentId}>
          <div className="item-top">
            <span className="item-creditor">{titleCase(m.title || m.role)}</span>
            <span className="badge accurate">{m.kind}</span>
          </div>
          <div className="item-meta">
            {m.role}{m.company ? ` · ${m.company}` : ''}
            {m.avgResponsiveness != null && <> · ★ {m.avgResponsiveness}</>}
          </div>
          <div className="rate-row">
            <span className="rate-label">Responsiveness:</span>
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} className="star" onClick={() => rate(m.userId, s)} aria-label={`Rate ${s}`}>★</button>
            ))}
          </div>
        </div>
      ))}

      <div className="h2">Messages</div>
      <div className="card thread">
        {messages.length === 0 && <div className="muted-card">No messages yet. Say hello.</div>}
        {messages.map((msg) => (
          <div key={msg.id} className={`bubble ${msg.sender_id === user.id ? 'mine' : 'theirs'}`}>
            {msg.body}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="msg-form" onSubmit={send}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message your team…" />
        <button className="btn send-btn" type="submit">Send</button>
      </form>

      {data.appointments.length > 0 && (
        <>
          <div className="h2">Appointments</div>
          {data.appointments.map((a) => (
            <div className="card" key={a.id}>
              <div className="item-top">
                <span className="item-creditor">{titleCase(a.type.replace('_', ' '))}</span>
                <span className={`badge status-${a.status}`}>{a.status}</span>
              </div>
              <div className="item-meta">{new Date(a.scheduled_at).toLocaleString()}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const titleCase = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
