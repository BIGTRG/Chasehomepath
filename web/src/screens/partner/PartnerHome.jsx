import { useEffect, useState } from 'react';
import { partner as partnerApi } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const usd = (n) => `$${Number(n ?? 0).toLocaleString()}`;

// Partner portal (spec §6): certification, assigned clients (in-app comms), inventory
// publishing, compliance profile — all in one console.
export default function PartnerHome() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [clients, setClients] = useState([]);
  const [listings, setListings] = useState([]);
  const [error, setError] = useState(null);

  // Certification form
  const [licenseType, setLicenseType] = useState('nc_broker');
  const [licenseNumber, setLicenseNumber] = useState('');
  // Publish form
  const [form, setForm] = useState({ type: 'house', price: '', address: '', beds: '', baths: '', sqft: '' });

  async function load() {
    try {
      setProfile(await partnerApi.profile());
      setClients((await partnerApi.clients()).clients);
      setListings((await partnerApi.listings()).listings);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function submitCert(e) {
    e.preventDefault();
    setError(null);
    try { await partnerApi.certify(licenseType, licenseNumber); await load(); }
    catch (e) { setError(e.message); }
  }

  async function publish(e) {
    e.preventDefault();
    setError(null);
    try {
      await partnerApi.publish({
        type: form.type,
        price: form.price ? Number(form.price) : undefined,
        address: form.address || undefined,
        beds: form.beds ? Number(form.beds) : undefined,
        baths: form.baths ? Number(form.baths) : undefined,
        sqft: form.sqft ? Number(form.sqft) : undefined,
      });
      setForm({ type: 'house', price: '', address: '', beds: '', baths: '', sqft: '' });
      await load();
    } catch (e) { setError(e.message); }
  }

  if (!profile) return <div className="loading">Loading…</div>;
  const certified = profile.certificationStatus === 'certified';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="op-shell">
      <aside className="op-side">
        <div className="op-brand">Chase<span className="path">HomePath</span><div className="op-role">partner portal</div></div>
        <div className="op-role" style={{ padding: '0 12px' }}>{profile.company}</div>
        <button className="btn secondary op-signout" onClick={logout}>Sign out</button>
      </aside>
      <main className="op-main">
        {error && <div className="error">{error}</div>}

        <h1 className="h1">Partner portal</h1>
        <p className="sub">
          Status: <span className={`hbadge ${certified ? 'green' : 'amber'}`}>{profile.certificationStatus}</span>
          {' '}· {profile.partnerType}
        </p>

        {/* Certification (spec §6.1) — required before listings go live */}
        {!certified && (
          <div className="card">
            <div className="h2" style={{ marginTop: 0 }}>Certification</div>
            <p className="sub">Certification is required before your clients or listings go live.</p>
            <form onSubmit={submitCert}>
              <div className="field">
                <label>License type</label>
                <select value={licenseType} onChange={(e) => setLicenseType(e.target.value)} className="op-select">
                  <option value="nc_broker">NC Broker</option>
                  <option value="bic">BIC</option>
                  <option value="nmls_mlo">NMLS MLO</option>
                  <option value="nmls_entity">NMLS Entity</option>
                </select>
              </div>
              <div className="field">
                <label>License number</label>
                <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required />
              </div>
              <button className="btn" type="submit">Submit for certification</button>
            </form>
          </div>
        )}

        {/* Compliance profile (spec §6.4) */}
        <div className="op-grid">
          <div className="card">
            <div className="h2" style={{ marginTop: 0 }}>Licenses</div>
            {profile.licenses.length === 0 && <div className="muted-card">None on file.</div>}
            {profile.licenses.map((l) => (
              <div className="op-row" key={l.id}>
                <span>{l.license_type}</span>
                <span className={`hbadge ${l.status === 'active' ? 'green' : 'amber'}`}>{l.status}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="h2" style={{ marginTop: 0 }}>Assigned clients ({clients.length})</div>
            {clients.length === 0 && <div className="muted-card">No clients assigned yet.</div>}
            {clients.map((c) => (
              <div className="op-row" key={c.memberId}><span>{c.email}</span><span className="item-meta">{c.roleOnTeam}</span></div>
            ))}
          </div>
        </div>

        {/* Inventory publishing (spec §6.3) */}
        <div className="h2">Publish inventory</div>
        <div className="card">
          <form onSubmit={publish} className="publish-form">
            <select value={form.type} onChange={set('type')} className="op-select">
              <option value="house">House</option><option value="lot">Lot</option>
            </select>
            <input placeholder="Price" value={form.price} onChange={set('price')} type="number" />
            <input placeholder="Address" value={form.address} onChange={set('address')} />
            <input placeholder="Beds" value={form.beds} onChange={set('beds')} type="number" />
            <input placeholder="Baths" value={form.baths} onChange={set('baths')} type="number" />
            <input placeholder="Sqft" value={form.sqft} onChange={set('sqft')} type="number" />
            <button className="btn small" type="submit">Submit for approval</button>
          </form>
        </div>

        <div className="h2">My listings ({listings.length})</div>
        {listings.map((l) => (
          <div className="card op-row" key={l.id}>
            <span>{usd(l.price)} · {l.type} · {l.address}</span>
            <span className={`hbadge ${l.status === 'active' ? 'green' : 'amber'}`}>{l.status}</span>
          </div>
        ))}
      </main>
    </div>
  );
}
