import { useState } from "react";
import ScreenTop from "../components/ScreenTop.jsx";
import { api } from "../api/client.js";

const AFFILIATE_URL = "https://www.smartcredit.com/join/?pid=79173";

export default function SmartCredit() {
  const [clicked, setClicked] = useState(false);

  async function enroll() {
    setClicked(true);
    try {
      await api("/smartcredit/click", { method: "POST" });
    } catch {
      /* best-effort tracking */
    }
    window.open(AFFILIATE_URL, "_blank", "noopener");
  }

  return (
    <div className="content">
      <ScreenTop title="Credit Monitoring" sub="Powered by SmartCredit®" />

      <div className="card" style={{ textAlign: "center", padding: "22px 18px" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
          SmartCredit&reg; 3-Bureau Monitoring
        </h2>
        <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55, margin: "0 0 16px" }}>
          See all 3 credit reports &amp; scores updated monthly. Track changes, get
          alerts, and take control of your credit journey — all in one place.
        </p>
        <button className="btn" onClick={enroll} style={{ width: "100%" }}>
          {clicked ? "Opening SmartCredit\u2026" : "Start 7-Day Trial \u2014 $1"}
        </button>
        <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>
          After trial: $39.90/mo &middot; Cancel anytime &middot; No credit impact
        </p>
        <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginTop: 8 }}>
          Disclosure: CHASE HomePath is a SmartCredit affiliate and receives a commission
          if you enroll through this link. This does not change your price. SmartCredit is
          operated by ConsumerDirect, Inc.; your report and score data stay with SmartCredit.
        </p>
      </div>

      <div className="lbl">What you get</div>

      <div className="card">
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <span className="cc o">1</span>
          <div className="grow">
            <div className="n">3-Bureau Credit Reports &amp; Scores</div>
            <div className="s">Equifax, Experian &amp; TransUnion — updated monthly</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <span className="cc o">2</span>
          <div className="grow">
            <div className="n">Real-Time Alerts</div>
            <div className="s">Know instantly when something changes on your report</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <span className="cc o">3</span>
          <div className="grow">
            <div className="n">Score Tracker</div>
            <div className="s">Watch your progress over time with visual trends</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <span className="cc o">4</span>
          <div className="grow">
            <div className="n">Identity Theft Insurance</div>
            <div className="s">$1M coverage included with your membership</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <span className="cc o">5</span>
          <div className="grow">
            <div className="n">Dispute Tools</div>
            <div className="s">File disputes directly from your SmartCredit dashboard</div>
          </div>
        </div>
      </div>

      <div className="note" style={{ marginTop: 18 }}>
        <strong>Why this matters for homeownership:</strong> Lenders pull all 3
        bureaus. Monitoring all 3 means no surprises when you apply for your
        mortgage. Your Chase HomePath specialist can review your SmartCredit
        reports during consultations.
      </div>

      <button className="btn" onClick={enroll} style={{ width: "100%", marginTop: 12 }}>
        {clicked ? "Opening SmartCredit\u2026" : "Get Started \u2014 $1 for 7 Days"}
      </button>
      <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginTop: 8 }}>
        Disclosure: CHASE HomePath is a SmartCredit affiliate and receives a commission
        if you enroll through this link. This does not change your price. SmartCredit is
        operated by ConsumerDirect, Inc.; your report and score data stay with SmartCredit.
      </p>
    </div>
  );
}
