import { useEffect, useRef, useState } from 'react';
import { team as teamApi } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ScreenTop from '../components/ScreenTop.jsx';

// Walkthrough screen 11: the assigned people, grouped CHASE staff vs certified partners.
// All contact in-app — no personal numbers. Rate them on responsiveness. (spec §4.12)
export default function Team() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [showThread, setShowThread] = useState(false);
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
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, showThread]);

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

  const staff = data.team.filter((m) => m.kind === 'staff');
  const partners = data.team.filter((m) => m.kind !== 'staff');

  return (
    <div className="content">
      <ScreenTop title="Your team" sub={`${data.team.length} on your build`} />

      {data.team.length === 0 && (
        <div className="card muted-card">Your team is being assembled. Check back soon.</div>
      )}

      {staff.length > 0 && <div className="lbl">CHASE HomePath</div>}
      {staff.map((m, i) => (
        <PersonCard key={m.assignmentId} m={m} lead={i === 0} onChat={() => setShowThread(true)} onRate={rate} />
      ))}

      {partners.length > 0 && <div className="lbl">Certified partners</div>}
      {partners.map((m) => (
        <PersonCard key={m.assignmentId} m={m} onChat={() => setShowThread(true)} onRate={rate} />
      ))}

      <div className="gy" style={{ marginTop: 14 }}>
        All contact runs through the app. No one has your personal number.
      </div>

      <div className="lbl">Messages</div>
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
          <div className="lbl">Appointments</div>
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

function PersonCard({ m, lead, onChat, onRate }) {
  const label = titleCase(m.company || m.title || m.role);
  const roleLine = lead
    ? `${titleCase(m.role)} · leads your plan`
    : titleCase(m.role);
  return (
    <div className={`card ${lead ? 'hl' : ''}`}>
      <div className="row">
        <span className="cc o">{initials(label)}</span>
        <div className="grow">
          <div className="n">{label}</div>
          <div className="s">{roleLine}{m.avgResponsiveness != null && <> · ★ {m.avgResponsiveness}</>}</div>
        </div>
        <button className="chat-ic" onClick={onChat} aria-label={`Message ${label}`}>💬</button>
      </div>
      <div className="rate-row">
        <span className="rate-label">Responsiveness:</span>
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} className="star" onClick={() => onRate(m.userId, s)} aria-label={`Rate ${s}`}>★</button>
        ))}
      </div>
    </div>
  );
}

const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const initials = (s) => String(s || '').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
