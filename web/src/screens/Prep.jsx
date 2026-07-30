import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { intake as intakeApi, money as moneyApi } from '../api/client.js';
import ScreenTop from '../components/ScreenTop.jsx';

// Walkthrough screen 5: camera capture, not printing and scanning. The paperless
// standard — file complete before they walk in. (spec §4.6)
export default function Prep() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingType, setPendingType] = useState(null);
  const fileRef = useRef(null);

  async function load() {
    try {
      setData(await intakeApi.checklist());
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  const nextUploadable = data?.items.find((i) => !i.done && i.docType !== 'bank_link');

  function snap(docType) {
    setPendingType(docType || nextUploadable?.docType || 'other');
    fileRef.current?.click();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pendingType) return;
    setBusy(true);
    setError(null);
    try {
      const dataBase64 = await toBase64(file);
      await intakeApi.uploadDocument({
        docType: pendingType,
        fileName: file.name || 'capture.jpg',
        mimeType: file.type || 'image/jpeg',
        dataBase64,
      });
      await load();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
      setPendingType(null);
    }
  }

  async function linkBank() {
    setBusy(true);
    setError(null);
    try {
      await moneyApi.link('public-mock-token');
      await moneyApi.sync();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div className="content"><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <div className="content">
      <ScreenTop title="Before your visit" sub={`${data.done} of ${data.total} done`} />

      <div className="bar" style={{ marginBottom: 16 }}>
        <span style={{ width: `${Math.round((data.done / data.total) * 100)}%` }} />
      </div>

      {error && <div className="error">{error}</div>}

      {data.items.map((i) => (
        <div className={`chk-row ${i.done ? 'done' : ''}`} key={i.docType}>
          <span>{i.label}</span>
          {i.done ? (
            <span className="tick">✓</span>
          ) : i.docType === 'bank_link' ? (
            <button className="btn small" onClick={linkBank} disabled={busy}
              style={{ background: 'var(--tint)', color: 'var(--orange-dark)' }}>Link</button>
          ) : (
            <button className="chat-ic" onClick={() => snap(i.docType)} disabled={busy} aria-label={`Upload ${i.label}`}>
              <span className="box" style={{ display: 'block' }} />
            </button>
          )}
        </div>
      ))}

      <button className="btn outline" onClick={() => snap()} disabled={busy || !nextUploadable} style={{ marginTop: 10 }}>
        📷 Snap a photo to upload
      </button>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment"
        style={{ display: 'none' }} onChange={onFile} />

      <div className="gy" style={{ marginTop: 12 }}>
        Take a picture — no printing, scanning, or email. We handle the rest.
      </div>

      <button className="btn" onClick={() => navigate('/')} style={{ marginTop: 6 }}>
        Go to your plan
      </button>
    </div>
  );
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
