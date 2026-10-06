import React, { useState, useEffect, useMemo } from "react";
import { Search, Mail, Check, Save, RefreshCw } from "lucide-react";

/* ----------------------------------------------------------------
   EMPLOYEE EMAILS
   - Employee name + department come automatically from the dashboard data.
   - The admin only types the email for each person and saves.
   - Backend routes used:  POST /getEmployeeEmails   POST /saveEmployeeEmails
----------------------------------------------------------------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmployeeEmails({ t, employees, api }) {
  const [saved, setSaved] = useState({});   // name -> email stored in the database
  const [draft, setDraft] = useState({});   // name -> email typed but not saved yet
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);     // { type: "ok" | "err", text }
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await api("getEmployeeEmails");
    if (r.ok) {
      const m = {};
      (r.list || []).forEach((x) => { m[x.name] = x.email || ""; });
      setSaved(m);
      setDraft({});
    } else {
      setMsg({ type: "err", text: r.error || "Could not load saved emails" });
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const valueOf = (name) => (name in draft ? draft[name] : saved[name] || "");
  const isDirty = (name) =>
    name in draft && draft[name].trim().toLowerCase() !== (saved[name] || "");
  const isInvalid = (name) => {
    const v = valueOf(name).trim();
    return v !== "" && !EMAIL_RE.test(v);
  };
  const setEmail = (name, v) => setDraft((d) => ({ ...d, [name]: v }));

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return employees.filter((e) =>
      (!activeOnly || e.active === "Active") &&
      (!s || e.name.toLowerCase().includes(s) || e.dept.toLowerCase().includes(s)) &&
      (!onlyMissing || !saved[e.name])
    );
  }, [employees, q, onlyMissing, activeOnly, saved]);

  const dirtyNames = employees.map((e) => e.name).filter(isDirty);
  const withEmail = employees.filter((e) => saved[e.name]).length;

  const saveNames = async (names) => {
    const bad = names.find(isInvalid);
    if (bad) { setMsg({ type: "err", text: `Invalid email for ${bad}` }); return; }
    setBusy(true); setMsg(null);
    const items = names.map((n) => ({
      name: n,
      dept: (employees.find((e) => e.name === n) || {}).dept || "",
      email: valueOf(n).trim().toLowerCase(),
    }));
    const r = await api("saveEmployeeEmails", { items });
    setBusy(false);
    if (r.ok) {
      setSaved((s) => { const c = { ...s }; items.forEach((i) => { c[i.name] = i.email; }); return c; });
      setDraft((d) => { const c = { ...d }; items.forEach((i) => { delete c[i.name]; }); return c; });
      setMsg({ type: "ok", text: `${items.length} email${items.length > 1 ? "s" : ""} saved` });
    } else {
      setMsg({ type: "err", text: r.error || "Save failed" });
    }
  };

  const pill = (on) => ({
    display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 22,
    border: `1px solid ${on ? t.primary : t.border}`, cursor: "pointer", fontSize: 12.5,
    fontWeight: on ? 600 : 500, background: on ? `${t.primary}14` : t.card,
    color: on ? t.primary : t.text,
  });

  return (
    <div style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, overflow: "hidden",
      boxShadow: "0 1px 2px rgba(60,64,67,.06), 0 2px 8px rgba(60,64,67,.04)",
    }}>
      {/* header */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
        justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${t.border}`,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Mail size={16} color={t.primary} /> Employee Emails
          </h3>
          <div style={{ fontSize: 12.5, color: t.sub, marginTop: 4 }}>
            {withEmail} of {employees.length} employees have an email
            {dirtyNames.length > 0 && ` · ${dirtyNames.length} unsaved`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={load} disabled={loading || busy} style={pill(false)} title="Reload saved emails">
            <RefreshCw size={14} style={{ animation: loading ? "spin .7s linear infinite" : "none" }} /> Reload
          </button>
          <button
            onClick={() => saveNames(dirtyNames)}
            disabled={busy || dirtyNames.length === 0}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 22,
              border: "none", fontSize: 12.5, fontWeight: 600, color: "#fff",
              background: dirtyNames.length === 0 ? t.track : t.primary,
              cursor: busy ? "wait" : dirtyNames.length === 0 ? "not-allowed" : "pointer",
            }}>
            <Save size={14} /> {busy ? "Saving…" : `Save all (${dirtyNames.length})`}
          </button>
        </div>
      </div>

      {/* filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "12px 20px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, background: t.hover, borderRadius: 11,
          padding: "8px 12px", flex: "1 1 220px", maxWidth: 340,
        }}>
          <Search size={15} color={t.sub} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or department…"
            style={{ border: "none", outline: "none", background: "transparent", color: t.text, fontSize: 13, width: "100%" }} />
        </div>
        <button onClick={() => setActiveOnly(!activeOnly)} style={pill(activeOnly)}>
          {activeOnly && <Check size={13} />} Active only
        </button>
        <button onClick={() => setOnlyMissing(!onlyMissing)} style={pill(onlyMissing)}>
          {onlyMissing && <Check size={13} />} Missing email only
        </button>
      </div>

      {msg && (
        <div style={{
          margin: "0 20px 12px", padding: "9px 14px", borderRadius: 8, fontSize: 12.5,
          background: msg.type === "ok" ? `${t.success}1F` : `${t.danger}14`,
          color: msg.type === "ok" ? t.success : t.danger,
        }}>{msg.text}</div>
      )}

      {/* table */}
      <div className="lk-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["#", "Employee", "Department", "Status", "Email", ""].map((h) => (
                <th key={h || "act"} style={{
                  padding: "11px 12px", textAlign: "left", fontSize: 12, fontWeight: 700,
                  color: t.header, background: t.hover, whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: t.sub }}>Loading…</td></tr>
            )}
            {!loading && list.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: t.sub }}>No employees match.</td></tr>
            )}
            {!loading && list.map((e, i) => {
              const dirty = isDirty(e.name);
              const bad = isInvalid(e.name);
              return (
                <tr key={e.name} style={{ borderTop: `1px solid ${t.border}` }}>
                  <td style={{ padding: "8px 12px", color: t.sub, fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{e.name}</td>
                  <td style={{ padding: "8px 12px", color: t.sub, whiteSpace: "nowrap" }}>{e.dept}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      padding: "3px 9px", borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                      background: e.active === "Active" ? `${t.success}22` : `${t.sub}22`,
                      color: e.active === "Active" ? t.success : t.sub,
                    }}>{e.active}</span>
                  </td>
                  <td style={{ padding: "8px 12px", minWidth: 260 }}>
                    <input
                      type="email"
                      value={valueOf(e.name)}
                      placeholder="name@gmail.com"
                      onChange={(ev) => setEmail(e.name, ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === "Enter" && dirty && !bad) saveNames([e.name]); }}
                      style={{
                        width: "100%", padding: "8px 10px", borderRadius: 8, fontSize: 13, outline: "none",
                        border: `1px solid ${bad ? t.danger : dirty ? t.primary : t.border}`,
                        background: t.card, color: t.text,
                      }} />
                    {bad && (
                      <div style={{ color: t.danger, fontSize: 11, marginTop: 3 }}>
                        Enter a valid email
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                    {dirty ? (
                      <button onClick={() => saveNames([e.name])} disabled={busy || bad} style={{
                        padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600,
                        background: bad ? t.track : t.primary, color: "#fff",
                        cursor: busy ? "wait" : bad ? "not-allowed" : "pointer",
                      }}>Save</button>
                    ) : saved[e.name] ? (
                      <span style={{ color: t.success, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Check size={14} /> Saved
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 18px", borderTop: `1px solid ${t.border}`, fontSize: 12.5, color: t.sub }}>
        Showing {list.length} of {employees.length} employees · press Enter in a box to save that row
      </div>
    </div>
  );
}