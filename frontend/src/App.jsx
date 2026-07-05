import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import {
  Search, Bell, Sun, Moon, Download, Users, UserCheck, UserX, Activity,
  CheckCircle2, Clock, Award, TrendingUp, TrendingDown, Filter, X,
  LayoutDashboard, Building2, CalendarDays, CalendarRange, Trophy, Sparkles,
  ChevronUp, ChevronDown, ArrowUpDown, Menu, ChevronLeft, ChevronRight,
  Lock, Mail, Eye, EyeOff, LogOut, FileText, FileSpreadsheet, FileJson,
  Image as ImageIcon, Printer, ShieldCheck, User, Phone, AtSign, Check,
  Trash2, Ban, RotateCcw, Settings, RefreshCw, ArrowUp, Rows3, Clock3,
  Columns
} from "lucide-react";

/* ----------------------------------------------------------------
   BACKEND — Node.js + MongoDB
   Local dev:  VITE_API_URL = "http://localhost:3000"
   Production: VITE_API_URL = your deployed Node URL (e.g. Render)
   Falls back to "http://localhost:3000" if no env var is set.

   Each action is its own POST route on the Node server, e.g.
   api("getData")  ->  POST {API_URL}/getData
   api("loginUser", {...})  ->  POST {API_URL}/loginUser
----------------------------------------------------------------- */
const API_URL = (
  import.meta.env.VITE_API_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

// async function api(action, payload = {}) {
//   try {
//     const res = await fetch(`${API_URL}/${action}`, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(payload),
//     });

//     const data = await res.json();

//     if (!res.ok) {
//       throw new Error(data.message || "Request failed");
//     }

//     return data;
//   } catch (error) {
//     console.error("API Error:", error);
//     throw error;
//   }
// }

async function api(action, payload = {}) {
  try {
    const res = await fetch(`${API_URL}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("API error:", err);
    return { ok: false, error: err.message };
  }
}

/* ----------------------------------------------------------------
   THEME TOKENS (Google Looker Studio palette)
----------------------------------------------------------------- */
const TOKENS = {
  light: {
    bg: "#F5F6F8", card: "#FFFFFF", border: "#DADCE0", primary: "#1A73E8",
    success: "#34A853", warning: "#FBBC04", danger: "#EA4335", text: "#202124",
    sub: "#5F6368", hover: "#F1F3F4", track: "#E8EAED",
    header: "#5F6368", // same as sub in light mode
  },
  dark: {
    bg: "#1B1C1F", card: "#26282C", border: "#3C4043", primary: "#8AB4F8",
    success: "#81C995", warning: "#FDD663", danger: "#F28B82", text: "#E8EAED",
    sub: "#9AA0A6", hover: "#303134", track: "#3C4043",
    header: "#D4AF37", // gold in dark mode
  },
};

const DEPARTMENTS = [
  "MDO", "PRODUCTION", "MAINTENANCE", "MARKET & SALES", "QC", "ADMIN", "MIS",
  "HR", "QA", "ENERGY SAVING", "ACCOUNT", "EXCISE", "CONSULTANT",
];

const DAY = 86400000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Build monthly trend from a (date-filtered) set of rows.
function monthlyFrom(rows) {
  const map = {};
  rows.forEach((row) => {
    // Prefer the real "Month & Year" field ("04/2024"); fall back to a valid date.
    let y, mo;
    const my = String(row.monthYear || "").match(/^(\d{1,2})\/(\d{4})$/);
    if (my) { mo = +my[1] - 1; y = +my[2]; }
    else if (row.date instanceof Date && !isNaN(row.date)) { y = row.date.getFullYear(); mo = row.date.getMonth(); }
    else return; // no usable month
    if (mo < 0 || mo > 11 || y < 2000) return;
    const key = `${y}-${mo}`;
    const m = (map[key] ||= {
      key, y, mo,
      planned: 0, actual: 0, onTime: 0, late: 0, scoreSum: 0, n: 0
    });
    m.planned += row.planned; m.actual += row.actual;
    m.onTime += row.onTime; m.late += row.late; m.scoreSum += row.score; m.n++;
  });
  return Object.values(map)
    .sort((a, b) => a.y - b.y || a.mo - b.mo)
    .map((m) => ({
      key: m.key, y: m.y, mo: m.mo,
      month: `${MONTHS[m.mo]} '${String(m.y).slice(2)}`,
      score: calcScore(m.planned, m.onTime, m.late),
      activities: m.actual,
      completion: m.planned ? +((m.actual / m.planned) * 100).toFixed(1) : 0,
    }));
}

// Build yearly trend from a (date-filtered) set of rows.
function yearlyFrom(rows) {
  const map = {};
  rows.forEach((row) => {
    // Prefer the real "Year" field (2024); fall back to monthYear, then a valid date.
    let y = parseInt(String(row.year || "").trim(), 10);
    if (!(y >= 2000 && y <= 2100)) {
      const my = String(row.monthYear || "").match(/\/(\d{4})$/);
      if (my) y = +my[1];
      else if (row.date instanceof Date && !isNaN(row.date)) y = row.date.getFullYear();
      else return;
    }
    if (!(y >= 2000 && y <= 2100)) return;
    const a = (map[y] ||= { year: `${y}`, planned: 0, actual: 0, onTime: 0, late: 0, scoreSum: 0, n: 0 });
    a.planned += row.planned; a.actual += row.actual;
    a.onTime += row.onTime; a.late += row.late; a.scoreSum += row.score; a.n++;
  });
  return Object.values(map)
    .sort((a, b) => +a.year - +b.year)
    .map((a) => ({
      year: a.year,
      score: calcScore(a.planned, a.onTime, a.late),
      productivity: a.planned ? +((a.actual / a.planned) * 100).toFixed(1) : 0,
      activities: a.actual,
    }));
}

/* Aggregate per-employee performance within a set of rows (e.g. one month/year). */
function employeesFrom(rows) {
  const map = {};
  rows.forEach((r) => {
    const e = (map[r.name] ||= {
      id: r.name, name: r.name, dept: r.dept, active: r.active,
      planned: 0, actual: 0, onTime: 0, late: 0, pending: 0, scoreSum: 0, n: 0
    });
    e.planned += r.planned; e.actual += r.actual; e.onTime += r.onTime;
    e.late += r.late; e.pending += r.pending; e.scoreSum += r.score; e.n++;
    e.active = r.active;
  });
  return Object.values(map)
    .map((e) => ({ ...e, score: calcScore(e.planned, e.onTime, e.late) }))
    .sort((a, b) => b.score - a.score); // high score = best
}

/* ----------------------------------------------------------------
   HELPERS
----------------------------------------------------------------- */
const fmt = (n) => n.toLocaleString("en-US");

// Looker Studio scoring formula:
// if SUM(Planned)=0 -> 0
// else ((SUM(OnTime) + SUM(Late)*0.5) / SUM(Planned) - 1) * 100
function calcScore(planned, onTime, late) {
  if (!planned) return 0;
  return +(((onTime + late * 0.5) / planned - 1) * 100).toFixed(2);
}

// Parse a date that may arrive as a Date, ISO string, YYYY-MM-DD, or DD/MM/YYYY.
// Rejects plain day-numbers ("1","2","309") and junk so bad years (0001, 100-310) never form.
function parseDate(v) {
  if (v instanceof Date) return isNaN(v) ? new Date(NaN) : v;
  const s = String(v ?? "").trim();
  if (!s) return new Date(NaN);
  // DD/MM/YYYY  (raw sheet "From" format) — check FIRST since it's the real source
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return d.getFullYear() === +m[3] ? d : new Date(NaN);
  }
  // DD-MM-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  // YYYY-MM-DD  (optionally with time, e.g. Mongo ISODate "2024-04-01T00:00:00Z")
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // Plain number like "1","2","309" (the old day-count column) is NOT a date.
  if (/^\d{1,4}$/.test(s)) return new Date(NaN);
  // Last resort: let Date try, but reject anything before year 2000.
  const d = new Date(s);
  if (isNaN(d) || d.getFullYear() < 2000) return new Date(NaN);
  return d;
}
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
// RAG scoring — reversed scale: LOWER score = good (Green), HIGHER score = bad (Red).
// Thresholds are computed from the actual data range so colors always spread,
// whether scores run 0..100, -45..100, or -250..0 (your real sheet values).
const RAG = {
  green: { fg: "#1E8E3E", bg: "rgba(52,168,83,.20)", label: "Green" },
  amber: { fg: "#B06000", bg: "rgba(251,188,4,.24)", label: "Amber" },
  red: { fg: "#C5221F", bg: "rgba(234,67,53,.20)", label: "Red" },
};
// Default thirds for a 0..100 scale; replaced at runtime by setRagRange().
let RAG_LOW = 33, RAG_HIGH = 66;
function setRagRange(scores) {
  if (!scores || !scores.length) return;
  const min = Math.min(...scores), max = Math.max(...scores);
  const span = max - min || 1;
  RAG_LOW = min + span / 3;        // green/amber boundary
  RAG_HIGH = min + (span * 2) / 3; // amber/red boundary
}
function ragBand(s) {
  if (s >= RAG_HIGH) return RAG.green;  // high score = good
  if (s >= RAG_LOW) return RAG.amber;
  return RAG.red;                        // low / most-negative = bad
}
function scoreColor(s) { return ragBand(s).fg; }
function scoreBg(s) { return ragBand(s).bg; }
// Local RAG band relative to a specific list (used so Monthly/Yearly tables,
// whose values cluster tightly, still spread green→red across their own range).
function localBand(value, list) {
  if (!list || !list.length) return RAG.amber;
  const min = Math.min(...list), max = Math.max(...list);
  const span = max - min || 1;
  if (value <= min + span / 3) return RAG.green;
  if (value <= min + (span * 2) / 3) return RAG.amber;
  return RAG.red;
}
function pendingBg(p, max) {
  const ratio = max ? p / max : 0;
  if (ratio > 0.66) return "rgba(234,67,53,.30)";
  if (ratio > 0.33) return "rgba(234,67,53,.15)";
  return "rgba(52,168,83,.15)";
}

/* ----------------------------------------------------------------
   SMALL UI PRIMITIVES
----------------------------------------------------------------- */
function Sparkline({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={34}>
      <LineChart data={data.map((v, i) => ({ i, v }))}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function KpiCard({ t, icon: Icon, label, value, growth, spark, delay, valueColor, ragLabel }) {
  const up = growth >= 0;
  return (
    <div className="lk-kpi-card" style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 16,
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10,
      boxShadow: "0 1px 2px rgba(60,64,67,.06), 0 2px 8px rgba(60,64,67,.04)",
      animation: `rise .55s cubic-bezier(.4,0,.2,1) ${delay}ms both`,
      transition: "transform .25s cubic-bezier(.4,0,.2,1), box-shadow .25s cubic-bezier(.4,0,.2,1)", cursor: "default",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 28px rgba(60,64,67,.14), 0 2px 8px rgba(60,64,67,.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(60,64,67,.06), 0 2px 8px rgba(60,64,67,.04)"; }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: t.header, fontWeight: 500, letterSpacing: ".1px" }}>{label}</span>
        <div style={{
          width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center",
          background: `linear-gradient(135deg, ${t.primary}1F, ${t.primary}10)`, color: t.primary
        }}>
          <Icon size={18} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
        <div className="lk-kpi-val" style={{ fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 700, color: valueColor || t.text, letterSpacing: "-.8px", lineHeight: 1.05, wordBreak: "break-word", minWidth: 0 }}>{value}</div>
        {ragLabel && (
          <span style={{
            padding: "2px 9px", borderRadius: 20, fontSize: 10.5, fontWeight: 700,
            background: scoreBg(parseFloat(value)), color: valueColor
          }}>{ragLabel}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          display: "flex", alignItems: "center", gap: 3, fontSize: 12,
          fontWeight: 600, color: up ? t.success : t.danger
        }}>
          {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{Math.abs(growth)}%
        </span>
        <div style={{ flex: 1 }}><Sparkline data={spark} color={up ? t.success : t.danger} /></div>
      </div>
    </div>
  );
}

function Panel({ t, title, action, children, style }) {
  return (
    <div className="lk-panel" style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 16,
      boxShadow: "0 1px 2px rgba(60,64,67,.06), 0 2px 8px rgba(60,64,67,.04)",
      overflow: "hidden", animation: "fadeIn .4s ease both",
      transition: "box-shadow .25s ease", ...style
    }}>
      {title && (
        <div className="lk-panel-head" style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 12, flexWrap: "wrap", padding: "16px 20px", borderBottom: `1px solid ${t.border}`
        }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: t.text, letterSpacing: "-.2px" }}>{title}</h3>
          {action}
        </div>
      )}
      <div className="lk-panel-body" style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------
   FILTER DROPDOWN (multi-select, searchable)
----------------------------------------------------------------- */
function MultiSelect({ t, label, options, selected, setSelected }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const filtered = options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
  const toggle = (o) => setSelected(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <div ref={ref} className="lk-multiselect" style={{ position: "relative", minWidth: 170 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 8, padding: "9px 14px", borderRadius: 22, border: `1px solid ${t.border}`,
        background: t.card, color: t.text, fontSize: 13, cursor: "pointer", fontWeight: 500
      }}>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}{selected.length ? ` · ${selected.length}` : ""}
        </span>
        <ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: ".2s" }} />
      </button>
      {open && (
        <div className="lk-multiselect-menu lk-pop" style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 40, width: 240,
          background: t.card, border: `1px solid ${t.border}`, borderRadius: 10,
          boxShadow: "0 8px 24px rgba(60,64,67,.2)", padding: 8, animation: "rise .15s both"
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
            background: t.hover, borderRadius: 7, marginBottom: 6
          }}>
            <Search size={14} color={t.sub} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
              style={{
                border: "none", outline: "none", background: "transparent",
                color: t.text, fontSize: 13, width: "100%"
              }} />
          </div>
          <div style={{ maxHeight: 230, overflowY: "auto" }}>
            {filtered.length > 0 && (
              <label style={{
                display: "flex", alignItems: "center", gap: 9, padding: "7px 8px",
                borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, color: t.primary,
                borderBottom: `1px solid ${t.border}`, marginBottom: 2
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <input type="checkbox"
                  checked={filtered.every((o) => selected.includes(o))}
                  ref={(el) => { if (el) el.indeterminate = filtered.some((o) => selected.includes(o)) && !filtered.every((o) => selected.includes(o)); }}
                  onChange={() => {
                    const allSelected = filtered.every((o) => selected.includes(o));
                    if (allSelected) setSelected(selected.filter((o) => !filtered.includes(o)));
                    else setSelected([...new Set([...selected, ...filtered])]);
                  }}
                  style={{ accentColor: t.primary }} />
                Select all{q ? " (matching)" : ""}
              </label>
            )}
            {filtered.map((o) => (
              <label key={o} style={{
                display: "flex", alignItems: "center", gap: 9, padding: "7px 8px",
                borderRadius: 6, cursor: "pointer", fontSize: 13, color: t.text
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)}
                  style={{ accentColor: t.primary }} />
                {o}
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <button onClick={() => setSelected([])} style={{
              width: "100%", marginTop: 6,
              padding: "7px", border: "none", borderRadius: 6, background: `${t.danger}14`,
              color: t.danger, fontSize: 12.5, fontWeight: 600, cursor: "pointer"
            }}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
   DATE RANGE PICKER (Looker Studio style: dual calendar + presets)
----------------------------------------------------------------- */
function Calendar({ t, view, setView, value, onPick, rangeStart, rangeEnd }) {
  const y = view.getFullYear(), mo = view.getMonth();
  const first = new Date(y, mo, 1);
  const startDow = (first.getDay() + 6) % 7; // Mon-first
  const days = new Date(y, mo + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, mo, d));
  const sameDay = (a, b) => a && b && a.toDateString() === b.toDateString();
  const inRange = (d) => rangeStart && rangeEnd && d >= rangeStart && d <= rangeEnd;
  return (
    <div className="lk-calendar" style={{ minWidth: 188 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <button onClick={() => setView(new Date(y, mo - 1, 1))} style={navBtn(t)}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          {view.toLocaleString("en-US", { month: "long" })} {y}
        </span>
        <button onClick={() => setView(new Date(y, mo + 1, 1))} style={navBtn(t)}><ChevronRight size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 9.5, color: t.sub, fontWeight: 600, padding: "1px 0" }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const sel = sameDay(d, value);
          const within = inRange(d);
          return (
            <button key={i} onClick={() => onPick(d)} style={{
              border: "none", cursor: "pointer", padding: "4px 0", fontSize: 11, borderRadius: 6,
              background: sel ? t.primary : within ? `${t.primary}22` : "transparent",
              color: sel ? "#fff" : t.text, fontWeight: sel ? 600 : 400, transition: ".12s"
            }}
              onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = t.hover; }}
              onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = within ? `${t.primary}22` : "transparent"; }}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
const navBtn = (t) => ({
  border: "none", background: "transparent", color: t.text,
  cursor: "pointer", display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 6
});

function DateRangePicker({ t, range, setRange, min, max }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);
  const [vStart, setVStart] = useState(range.start || min);
  const [vEnd, setVEnd] = useState(range.end || max);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Anchor presets to TODAY (real calendar), but never beyond the data's max.
  // This stops bad future dates in the data (e.g. 2039) from hijacking the view.
  const todayReal = new Date();
  const validMax = max instanceof Date && !isNaN(max) && max <= todayReal ? max : todayReal;
  const anchor = validMax;
  const aYear = anchor.getFullYear();
  const aMonth = anchor.getMonth();
  const aDay = new Date(aYear, aMonth, anchor.getDate());
  const startOfMonth = new Date(aYear, aMonth, 1);
  const endOfMonth = new Date(aYear, aMonth + 1, 0);
  const startOfYear = new Date(aYear, 0, 1);
  const endOfYear = new Date(aYear, 11, 31);
  const aQuarter = Math.floor(aMonth / 3);            // 0-3
  const startOfQuarter = new Date(aYear, aQuarter * 3, 1);
  const endOfQuarter = new Date(aYear, aQuarter * 3 + 3, 0);
  // Clamp any date into the data's [min, max] window.
  const clamp = (d) => (d < min ? min : d > max ? max : d);

  const presets = [
    ["Last day", () => [aDay, aDay]],
    ["Last 7 days", () => [clamp(new Date(aDay.getTime() - 6 * DAY)), aDay]],
    ["Last 30 days", () => [clamp(new Date(aDay.getTime() - 29 * DAY)), aDay]],
    ["This month", () => [clamp(startOfMonth), clamp(endOfMonth)]],
    ["This quarter", () => [clamp(startOfQuarter), clamp(endOfQuarter)]],
    ["This year", () => [clamp(startOfYear), clamp(endOfYear)]],
    ["All time", () => [min, validMax]],
  ];

  const apply = () => { setRange({ start, end }); setOpen(false); };
  const clear = () => { setStart(null); setEnd(null); setRange({ start: null, end: null }); setOpen(false); };

  // Show a friendly preset name when the selected range matches one exactly.
  const sameDay2 = (a, b) => a && b && a.toDateString() === b.toDateString();
  const matchedPreset = (range.start && range.end)
    ? (presets.find(([, fn]) => {
      const [s, e] = fn();
      return sameDay2(s, range.start) && sameDay2(e, range.end);
    }) || [])[0]
    : null;

  const label = range.start && range.end
    ? (matchedPreset || `${fmtDate(range.start)} – ${fmtDate(range.end)}`)
    : "All dates";

  // When opened with no range yet, pre-fill the data's latest month and point
  // both calendars at real data (not an empty current calendar month).
  useEffect(() => {
    if (open && !range.start && !start) {
      setStart(clamp(startOfMonth));
      setEnd(clamp(endOfMonth));
      setVStart(clamp(startOfMonth));
      setVEnd(clamp(endOfMonth));
    } else if (open) {
      // Always open the calendars on the data range, even if a range is set.
      setVStart((v) => v || clamp(startOfMonth));
      setVEnd((v) => v || clamp(endOfMonth));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ref} className="lk-date-picker" style={{ position: "relative" }}>
      <button className="lk-date-button" onClick={() => setOpen(!open)} style={{
        display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 22,
        border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: 13,
        fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap"
      }}>
        <CalendarRange size={15} color={t.sub} /> {label}
        <ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: ".2s" }} />
      </button>
      {open && (
        <div className="lk-daterange-pop" style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 70,
          background: t.card, border: `1px solid ${t.border}`, borderRadius: 12,
          boxShadow: "0 12px 40px rgba(60,64,67,.25)", padding: 12, animation: "rise .15s both",
          display: "flex", gap: 12, flexWrap: "nowrap", alignItems: "flex-start"
        }}>
          <div style={{
            display: "flex", flexDirection: "column", gap: 2, minWidth: 108,
            borderRight: `1px solid ${t.border}`, paddingRight: 10
          }}>
            {presets.map(([n, fn]) => (
              <button key={n} onClick={() => { const [s, e] = fn(); setStart(s); setEnd(e); setVStart(s); setVEnd(e); }}
                style={{
                  textAlign: "left", border: "none", background: "transparent", color: t.text,
                  fontSize: 11.5, padding: "5px 8px", borderRadius: 6, cursor: "pointer"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{n}</button>
            ))}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="lk-calendar-pair" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ textAlign: "center", fontSize: 10.5, fontWeight: 600, color: t.sub, marginBottom: 5 }}>Start date</div>
                <Calendar t={t} view={vStart} setView={setVStart} value={start}
                  rangeStart={start} rangeEnd={end}
                  onPick={(d) => { setStart(d); if (end && d > end) setEnd(d); }} />
              </div>
              <div>
                <div style={{ textAlign: "center", fontSize: 10.5, fontWeight: 600, color: t.sub, marginBottom: 5 }}>End date</div>
                <Calendar t={t} view={vEnd} setView={setVEnd} value={end}
                  rangeStart={start} rangeEnd={end}
                  onPick={(d) => { if (start && d < start) setStart(d); setEnd(d); }} />
              </div>
            </div>
            <div className="lk-date-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button onClick={clear} style={{
                border: "none", background: "transparent", color: t.sub,
                fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "8px 14px"
              }}>Clear</button>
              <button onClick={apply} disabled={!start || !end} style={{
                border: "none", borderRadius: 20,
                background: (!start || !end) ? t.track : t.primary, color: "#fff", fontSize: 13,
                fontWeight: 600, cursor: (!start || !end) ? "not-allowed" : "pointer", padding: "8px 20px"
              }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
   AUTH — backed by MongoDB "users" collection (Node.js backend)
   Fields: fullName, email, mobile, username, password, role, status
----------------------------------------------------------------- */
function pwStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s; // 0-4
}

// Module-level so they aren't recreated each render (avoids input focus loss).
function LoginWrap({ icon: Ic, t, children }) {
  return (
    <div style={{ position: "relative", margin: "6px 0 14px" }}>
      <Ic size={17} color={t.sub} style={{ position: "absolute", left: 14, top: 13 }} />
      {children}
    </div>
  );
}
function LoginLabel({ t, children }) {
  return <label style={{ fontSize: 12.5, fontWeight: 600, color: t.sub }}>{children}</label>;
}

function LoginPage({ onLogin }) {
  const t = TOKENS.light;
  const [mode, setMode] = useState("login"); // login | signup
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [showPw, setShowPw] = useState(false);

  // login fields (username OR email)
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [remember, setRemember] = useState(true);

  // signup fields
  const [su, setSu] = useState({ fullName: "", email: "", mobile: "", username: "", password: "", confirm: "" });
  const setF = (k, v) => setSu((p) => ({ ...p, [k]: v }));

  const doLogin = async () => {
    setErr(""); setBusy(true);
    const r = await api("loginUser", { loginId: loginId.trim(), password: loginPw });
    setBusy(false);
    if (r.ok) onLogin(r.user);
    else setErr(r.error || "Invalid credentials.");
  };

  const doSignup = async () => {
    setErr("");
    if (!su.fullName.trim()) return setErr("Full name is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(su.email)) return setErr("Enter a valid email address.");
    if (!/^\d{10}$/.test(su.mobile)) return setErr("Mobile must be 10 digits.");
    if (su.username.trim().length < 3) return setErr("Username must be at least 3 characters.");
    if (pwStrength(su.password) < 2) return setErr("Password too weak. Add length, numbers, or symbols.");
    if (su.password !== su.confirm) return setErr("Passwords do not match.");

    setBusy(true);
    const r = await api("registerUser", {
      fullName: su.fullName.trim(), email: su.email.trim(), mobile: su.mobile,
      username: su.username.trim(), password: su.password,
    });
    setBusy(false);
    if (r.ok) {
      setToast(`Account created! You can sign in now.`);
      setMode("login");
      setLoginId(su.username.trim());
      setSu({ fullName: "", email: "", mobile: "", username: "", password: "", confirm: "" });
      setTimeout(() => setToast(""), 4000);
    } else {
      setErr(r.error || "Registration failed.");
    }
  };

  const field = {
    width: "100%", padding: "12px 14px 12px 42px", borderRadius: 10,
    border: `1px solid ${t.border}`, fontSize: 14, outline: "none", color: t.text,
    background: "#fff", boxSizing: "border-box",
  };

  const strength = pwStrength(su.password);
  const strengthLabel = ["Very weak", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["#EA4335", "#EA4335", "#FBBC04", "#34A853", "#1E8E3E"][strength];

  return (
    <div className="lk-login-page" style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      fontFamily: "'Inter','Google Sans','Segoe UI',Roboto,system-ui,sans-serif",
      background: "radial-gradient(1200px 600px at 50% -10%, #E8F0FE 0%, #F5F6F8 45%, #E6F4EA 100%)",
      padding: 20, WebkitFontSmoothing: "antialiased"
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .lk-login input{transition:border-color .2s, box-shadow .2s}
        .lk-login input:focus{outline:none;border-color:#1A73E8!important;box-shadow:0 0 0 3px rgba(26,115,232,.2)!important}
        .lk-login button{transition:transform .12s, background .2s, box-shadow .2s}
        .lk-login button:active{transform:scale(.98)}
        /* Tablet */
        @media(max-width:768px){
          .lk-login-page{padding:32px 24px!important}
          .lk-login{max-width:420px!important}
        }
        /* Mobile */
        @media(max-width:520px){
          .lk-login-page{min-height:100dvh!important;padding:24px!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow-y:auto}
          .lk-login{width:100%!important;max-width:100%!important;border-radius:16px!important;padding:26px 22px!important;margin:0!important}
          .lk-login input{font-size:16px!important}
          .lk-login button{min-height:46px}
          .lk-login-logo{height:70px!important;margin-top:-15px!important;margin-left:0!important}
        }
        /* Small phones */
        @media(max-width:380px){
          .lk-login-page{padding:16px!important}
          .lk-login{padding:22px 18px!important;border-radius:14px!important}
          .lk-login-logo{height:60px!important}
        }
          {
         .lk-login-page{min-height:100dvh!important;padding:24px!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow-y:auto}
        .lk-login{width:calc(100% - 48px)!important;max-width:380px!important;border-radius:16px!important;padding:24px 20px!important;margin:0 auto!important}
          .lk-login input{font-size:16px!important}
          .lk-login button{min-height:44px}
        }
        @media(max-width:360px){.lk-login{padding:20px 14px!important}}`}</style>

      {toast && (
        <div style={{
          position: "fixed", top: 22, left: "50%", transform: "translateX(-50%)",
          background: "#1E8E3E", color: "#fff", padding: "12px 20px", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(30,142,62,.35)", fontSize: 13.5, fontWeight: 500, zIndex: 100,
          display: "flex", alignItems: "center", gap: 9, animation: "rise .3s both"
        }}>
          <Check size={17} /> {toast}
        </div>
      )}

      <div className="lk-login" style={{
        width: "100%", maxWidth: 420, background: "#fff", borderRadius: 20,
        border: `1px solid ${t.border}`, boxShadow: "0 24px 60px rgba(60,64,67,.16), 0 4px 16px rgba(60,64,67,.08)",
        padding: "36px 34px", animation: "rise .45s cubic-bezier(.4,0,.2,1) both"
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <img src="/bhas2.png" alt="logo" style={{ height: 150, width: "auto", objectFit: "contain", display: "block", marginTop: "-30px" }} />
          <div style={{ fontWeight: 700, fontSize: 19, color: t.text, letterSpacing: "-.4px", marginTop: "-30px"}}>Bhaskar Employee Score</div>
        </div>
        <p style={{ margin: "0 0 20px", color: t.sub, fontSize: 13.5 }}>
          {mode === "login" ? "Welcome back — sign in to continue" : "Create your account"}
        </p>

        {/* Mode toggle */}
        <div style={{ display: "flex", background: "#F1F3F4", borderRadius: 10, padding: 4, marginBottom: 20 }}>
          {["login", "signup"].map((m) => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{
              flex: 1, padding: "8px",
              border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13.5, fontWeight: 600,
              background: mode === m ? "#fff" : "transparent", color: mode === m ? t.primary : t.sub,
              boxShadow: mode === m ? "0 1px 3px rgba(60,64,67,.18)" : "none", transition: ".15s"
            }}>
              {m === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {err && (
          <div style={{
            background: `${t.danger}14`, color: t.danger, fontSize: 12.5,
            padding: "9px 12px", borderRadius: 8, marginBottom: 14
          }}>{err}</div>
        )}

        {mode === "login" ? (
          <>
            <LoginLabel t={t}>Username or Email</LoginLabel>
            <LoginWrap icon={User} t={t}>
              <input value={loginId} onChange={(e) => setLoginId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
                placeholder="username or you@company.com" style={field} />
            </LoginWrap>
            <LoginLabel t={t}>Password</LoginLabel>
            <div style={{ position: "relative", margin: "6px 0 8px" }}>
              <Lock size={17} color={t.sub} style={{ position: "absolute", left: 14, top: 13 }} />
              <input value={loginPw} type={showPw ? "text" : "password"}
                onChange={(e) => setLoginPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
                placeholder="••••••••" style={field} />
              <button onClick={() => setShowPw(!showPw)} style={{
                position: "absolute", right: 12, top: 11,
                border: "none", background: "transparent", cursor: "pointer", color: t.sub
              }}>
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0 8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: t.sub, cursor: "pointer" }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                  style={{ accentColor: t.primary }} /> Remember me
              </label>
              <button onClick={() => { setToast("Password reset link would be emailed (forgotPassword API)."); setTimeout(() => setToast(""), 3500); }}
                style={{
                  border: "none", background: "transparent", color: t.primary, fontSize: 12.5,
                  fontWeight: 600, cursor: "pointer"
                }}>Forgot password?</button>
            </div>

            <button onClick={doLogin} disabled={busy} style={{
              width: "100%", marginTop: 10, padding: "13px",
              border: "none", borderRadius: 10, background: t.primary, color: "#fff", fontSize: 14.5,
              fontWeight: 600, cursor: busy ? "wait" : "pointer", display: "flex", justifyContent: "center",
              alignItems: "center", gap: 9
            }}>
              {busy && <span style={{
                width: 16, height: 16, border: "2px solid rgba(255,255,255,.4)",
                borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite"
              }} />}
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <button onClick={async () => {
              setBusy(true);
              const r = await api("loginUser", { loginId: "admin", password: "admin123" });
              setBusy(false);
              if (r.ok) onLogin(r.user);
              else setErr("Default admin login failed. Check the backend is running.");
            }} style={{
              width: "100%", marginTop: 10, padding: "12px",
              borderRadius: 10, border: `1px solid ${t.border}`, background: "#fff", color: t.text,
              fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", justifyContent: "center",
              alignItems: "center", gap: 9
            }}>
              <svg width="17" height="17" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.2 13.4 17.6 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z" /><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.8l7.8-6.1z" /><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.8-3.9-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
              Quick login as admin
            </button>
          </>
        ) : (
          <>
            <LoginLabel t={t}>Full Name</LoginLabel>
            <LoginWrap icon={User} t={t}>
              <input value={su.fullName} onChange={(e) => setF("fullName", e.target.value)} placeholder="John Doe" style={field} />
            </LoginWrap>
            <LoginLabel t={t}>Email</LoginLabel>
            <LoginWrap icon={Mail} t={t}>
              <input value={su.email} onChange={(e) => setF("email", e.target.value)} placeholder="you@company.com" style={field} />
            </LoginWrap>
            <LoginLabel t={t}>Mobile Number</LoginLabel>
            <LoginWrap icon={Phone} t={t}>
              <input value={su.mobile} onChange={(e) => setF("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit number" style={field} />
            </LoginWrap>
            <LoginLabel t={t}>Username</LoginLabel>
            <LoginWrap icon={AtSign} t={t}>
              <input value={su.username} onChange={(e) => setF("username", e.target.value)} placeholder="Choose a username" style={field} />
            </LoginWrap>
            <LoginLabel t={t}>Password</LoginLabel>
            <div style={{ position: "relative", margin: "6px 0 6px" }}>
              <Lock size={17} color={t.sub} style={{ position: "absolute", left: 14, top: 13 }} />
              <input value={su.password} type={showPw ? "text" : "password"}
                onChange={(e) => setF("password", e.target.value)} placeholder="••••••••" style={field} />
              <button onClick={() => setShowPw(!showPw)} style={{
                position: "absolute", right: 12, top: 11,
                border: "none", background: "transparent", cursor: "pointer", color: t.sub
              }}>
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {su.password && (
              <div style={{ margin: "0 0 12px" }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} style={{
                      flex: 1, height: 4, borderRadius: 4,
                      background: i < strength ? strengthColor : "#E8EAED"
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, color: strengthColor, fontWeight: 600 }}>{strengthLabel}</span>
              </div>
            )}
            <LoginLabel t={t}>Confirm Password</LoginLabel>
            <LoginWrap icon={Lock} t={t}>
              <input value={su.confirm} type={showPw ? "text" : "password"}
                onChange={(e) => setF("confirm", e.target.value)} placeholder="••••••••" style={field} />
            </LoginWrap>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={doSignup} disabled={busy} style={{
                flex: 2, padding: "13px", border: "none",
                borderRadius: 10, background: t.primary, color: "#fff", fontSize: 14.5, fontWeight: 600,
                cursor: busy ? "wait" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 9
              }}>
                {busy && <span style={{
                  width: 16, height: 16, border: "2px solid rgba(255,255,255,.4)",
                  borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite"
                }} />}
                {busy ? "Creating…" : "Register"}
              </button>
              <button onClick={() => setSu({ fullName: "", email: "", mobile: "", username: "", password: "", confirm: "" })}
                style={{
                  flex: 1, padding: "13px", borderRadius: 10, border: `1px solid ${t.border}`,
                  background: "#fff", color: t.text, fontSize: 14, fontWeight: 500, cursor: "pointer"
                }}>
                Reset
              </button>
            </div>
            <p style={{ textAlign: "center", fontSize: 12.5, color: t.sub, marginTop: 16 }}>
              Already have an account?{" "}
              <button onClick={() => { setMode("login"); setErr(""); }} style={{
                border: "none",
                background: "transparent", color: t.primary, fontWeight: 600, cursor: "pointer"
              }}>Sign in</button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   MAIN APP
----------------------------------------------------------------- */
export default function App() {
  const [user, setUser] = useState(null);

  // Ensure proper mobile scaling even if index.html is missing the viewport tag.
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
  }, []);
  const [dark, setDark] = useState(false);
  const t = dark ? TOKENS.dark : TOKENS.light;
  const [tab, setTab] = useState("dept");
  const [sidebar, setSidebar] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // DATA from Node.js + MongoDB backend
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Clean one raw row. Supports compact arrays [date,name,dept,planned,actual,late,onTime,pending,score,week,monthYear,quarter,active,year]
  // and objects from the Node backend (toFrontendRow shape).
  const normalizeRow = (x, i) => {
    // Map compact array -> object first
    const o = Array.isArray(x) ? {
      date: x[0], name: x[1], dept: x[2], planned: x[3], actual: x[4],
      late: x[5], onTime: x[6], pending: x[7], score: x[8], week: x[9],
      monthYear: x[10], quarter: x[11], active: x[12], year: x[13],
    } : x;
    let score = Number(o.score);
    if (!isFinite(score) || Math.abs(score) > 100000) score = 0;
    score = Math.round(score * 100) / 100;
    const rawStatus = String(o.active || "").trim();
    const lc = rawStatus.toLowerCase();
    let status;
    if (lc === "") status = "Blank";
    else if (lc.includes("n/a") || lc === "#n/a") status = "#N/A";
    else if (lc.includes("inactive") || lc.includes("not")) status = "Inactive";
    else if (lc.includes("active")) status = "Active";
    else status = rawStatus;
    return {
      id: i, name: String(o.name || "").trim(), dept: String(o.dept || "").trim(),
      // "date" already comes from the backend's "From" field (the real date).
      date: parseDate(o.date),
      planned: Number(o.planned) || 0, actual: Number(o.actual) || 0,
      onTime: Number(o.onTime) || 0, late: Number(o.late) || 0,
      pending: Number(o.pending) || 0, score, active: status,
      week: String(o.week || "").trim(),
      monthYear: String(o.monthYear || "").trim(),
      quarter: String(o.quarter || "").trim(),
      year: String(o.year || "").trim(),
    };
  };

  // ---- NEW FEATURE STATE (additive, does not affect existing logic) ----
  const [lastUpdated, setLastUpdated] = useState(null);   // time of last data load
  const [refreshing, setRefreshing] = useState(false);    // manual refresh spinner
  const [density, setDensity] = useState("comfortable");  // table density toggle
  const [showTop, setShowTop] = useState(false);          // back-to-top button
  const [nowTick, setNowTick] = useState(Date.now());     // re-render "x min ago"

  // Reusable loader used by initial load, auto-refresh, and the manual button.
  const refreshData = (manual = false) => {
    if (manual) setRefreshing(true);
    return api("getData", { fresh: true }).then((r) => {
      if (r.ok && r.rows) setRows(r.rows.map(normalizeRow).filter((x) => x.name));
      setLastUpdated(Date.now());
      if (manual) setRefreshing(false);
    }).catch(() => { if (manual) setRefreshing(false); });
  };

  // Fetch data from backend when user logs in
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api("getData").then((r) => {
      if (r.ok && r.rows) setRows(r.rows.map(normalizeRow).filter((x) => x.name));
      setLastUpdated(Date.now());
      setLoading(false);
    });
  }, [user]);

  // Auto-refresh every 5 minutes (fresh=true bypasses any server cache)
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => { refreshData(false); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [user]);

  // Tick every 30s so "Updated x min ago" stays current.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Window scroll: show back-to-top, and load more employee rows near the bottom.
  useEffect(() => {
    const onScroll = () => {
      setShowTop(window.scrollY > 400);
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 250;
      if (nearBottom && tab === "emp") {
        setVisibleCount((c) => Math.min(c + STEP, sortedLenRef.current));
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [tab]);

  // Keyboard shortcut: "/" focuses search, "Esc" clears it.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (e.key === "/" && tag !== "input" && tag !== "textarea" && tag !== "select") {
        e.preventDefault();
        const el = document.getElementById("lk-search-input");
        if (el) el.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Human-friendly "time ago" for the last-updated label.
  const timeAgo = (ts) => {
    if (!ts) return "—";
    const s = Math.floor((nowTick - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    return `${h} hr ago`;
  };

  // Compute date range from actual data for DateRangePicker
  const dataDateRange = useMemo(() => {
    const nowY = new Date().getFullYear();
    const fallback = { min: new Date(nowY - 2, 0, 1), max: new Date() };
    if (!rows.length) return fallback;
    const dates = rows.map((r) => r.date).filter((d) => d instanceof Date && !isNaN(d) && d.getFullYear() >= 2020 && d.getFullYear() <= nowY + 1);
    if (!dates.length) return fallback;
    return {
      min: new Date(Math.min(...dates)),
      max: new Date(Math.max(...dates)),
    };
  }, [rows]);

  // filters
  const [fDept, setFDept] = useState([]);
  const [fStatus, setFStatus] = useState([]);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "score", dir: "desc" });
  const [visibleCount, setVisibleCount] = useState(25);
  const STEP = 25;
  const scrollRef = useRef(null);
  const sortedLenRef = useRef(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [selMonth, setSelMonth] = useState(null);
  const [selYear, setSelYear] = useState(null);
  const [scoringView, setScoringView] = useState("doer"); // Monthly tab dropdown
  const [scoreSort, setScoreSort] = useState({ key: "yearly", dir: "desc" }); // Score Summary column sort
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMsg, setAdminMsg] = useState("");
  const [adminForm, setAdminForm] = useState(null); // null = closed; {} = add; {...} = edit
  const isAdmin = user && String(user.role || "").toLowerCase() === "admin";

  const blankForm = { fullName: "", email: "", mobile: "", username: "", password: "", role: "Employee", status: "Active", _edit: false };

  // Load all users for the admin page
  const loadUsers = () => {
    setAdminBusy(true);
    api("listUsers").then((r) => {
      if (r.ok) setAdminUsers(r.users || []);
      else setAdminMsg(r.error || "Failed to load users");
      setAdminBusy(false);
    });
  };
  useEffect(() => { if (isAdmin && tab === "admin") loadUsers(); }, [isAdmin, tab]);

  const saveUser = async () => {
    const f = adminForm;
    if (!f.fullName.trim() || !f.username.trim()) { setAdminMsg("Full name and username are required"); return; }
    setAdminBusy(true);
    const action = f._edit ? "updateUser" : "createUser";
    const payload = {
      fullName: f.fullName.trim(), email: f.email.trim(), mobile: f.mobile.trim(),
      username: f.username.trim(), role: f.role, status: f.status
    };
    if (f.password) payload.password = f.password;
    const r = await api(action, payload);
    if (r.ok) { setAdminMsg(f._edit ? `${f.username} updated` : `${f.username} created`); setAdminForm(null); loadUsers(); }
    else { setAdminMsg(r.error || "Save failed"); setAdminBusy(false); }
  };

  const blockUser = async (u) => {
    setAdminBusy(true);
    const newStatus = String(u.status).toLowerCase() === "active" ? "Blocked" : "Active";
    const r = await api("setUserStatus", { username: u.username, status: newStatus });
    if (r.ok) { setAdminMsg(`${u.username} is now ${newStatus}`); loadUsers(); }
    else { setAdminMsg(r.error || "Action failed"); setAdminBusy(false); }
  };
  const removeUser = async (u) => {
    if (!window.confirm(`Delete user "${u.username}"? This removes them from the users collection.`)) return;
    setAdminBusy(true);
    const r = await api("deleteUser", { username: u.username });
    if (r.ok) { setAdminMsg(`${u.username} deleted`); loadUsers(); }
    else { setAdminMsg(r.error || "Delete failed"); setAdminBusy(false); }
  };

  const filtered = useMemo(() => {
    const s = dateRange.start ? new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), dateRange.start.getDate()) : null;
    const e = dateRange.end ? new Date(dateRange.end.getFullYear(), dateRange.end.getMonth(), dateRange.end.getDate(), 23, 59, 59) : null;
    return rows.filter((r) => {
      const validDate = r.date instanceof Date && !isNaN(r.date);
      return (!fDept.length || fDept.includes(r.dept)) &&
        (!fStatus.length || fStatus.includes(r.active)) &&
        (!s || (validDate && r.date >= s)) && (!e || (validDate && r.date <= e)) &&
        (!search || r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.dept.toLowerCase().includes(search.toLowerCase()));
    });
  }, [rows, fDept, fStatus, dateRange, search]);

  // Per-person aggregation (rows are daily records) for table + leaderboard
  const empAgg = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const e = (map[r.name] ||= {
        id: r.name, name: r.name, dept: r.dept, active: r.active,
        planned: 0, actual: 0, onTime: 0, late: 0, pending: 0, scoreSum: 0, n: 0
      });
      e.planned += r.planned; e.actual += r.actual; e.onTime += r.onTime;
      e.late += r.late; e.pending += r.pending; e.scoreSum += r.score; e.n++;
      e.active = r.active;
    });
    const list = Object.values(map).map((e) => ({ ...e, score: calcScore(e.planned, e.onTime, e.late) }));
    setRagRange(list.map((e) => e.score)); // calibrate RAG colors to actual range
    return list;
  }, [filtered]);

  const sorted = useMemo(() => {
    const arr = [...empAgg].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === "string") return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [empAgg, sort]);

  useEffect(() => { setVisibleCount(25); if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [fDept, fStatus, search, sort, dateRange]);

  const MONTHLY = useMemo(() => monthlyFrom(filtered), [filtered]);
  const YEARLY = useMemo(() => yearlyFrom(filtered), [filtered]);

  // Default the period selectors to the most recent available period.
  const activeMonthKey = selMonth || (MONTHLY.length ? MONTHLY[MONTHLY.length - 1].key : null);
  const activeYear = selYear || (YEARLY.length ? YEARLY[YEARLY.length - 1].year : null);

  // Match a row to a "YYYY-M" month key using its real "Month & Year" field first.
  const rowMonthKey = (r) => {
    const my = String(r.monthYear || "").match(/^(\d{1,2})\/(\d{4})$/);
    if (my) return `${+my[2]}-${+my[1] - 1}`;
    if (r.date instanceof Date && !isNaN(r.date)) return `${r.date.getFullYear()}-${r.date.getMonth()}`;
    return null;
  };
  // Resolve a row's year from its real "Year" field first.
  const rowYear = (r) => {
    let y = parseInt(String(r.year || "").trim(), 10);
    if (y >= 2000 && y <= 2100) return String(y);
    const my = String(r.monthYear || "").match(/\/(\d{4})$/);
    if (my) return my[1];
    if (r.date instanceof Date && !isNaN(r.date)) return String(r.date.getFullYear());
    return null;
  };

  const monthEmployees = useMemo(() => {
    if (!activeMonthKey) return [];
    return employeesFrom(filtered.filter((r) => rowMonthKey(r) === activeMonthKey));
  }, [filtered, activeMonthKey]);

  const yearEmployees = useMemo(() => {
    if (!activeYear) return [];
    return employeesFrom(filtered.filter((r) => rowYear(r) === String(activeYear)));
  }, [filtered, activeYear]);

  // Scoring View (Monthly tab dropdown): group filtered rows by the chosen key.
  const scoringData = useMemo(() => {
    const keyFns = {
      doer: (r) => r.name,
      dept: (r) => r.dept,
      week: (r) => `Week ${r.week || "?"}`,
      month: (r) => r.monthYear || `${r.date.getFullYear()}-${pad(r.date.getMonth() + 1)}`,
      year: (r) => r.year || String(r.date.getFullYear()),
    };
    const keyFn = keyFns[scoringView] || keyFns.doer;
    const map = {};
    filtered.forEach((r) => {
      const k = keyFn(r);
      if (!k) return;
      const g = (map[k] ||= { label: k, planned: 0, actual: 0, onTime: 0, late: 0, pending: 0, scoreSum: 0, n: 0 });
      g.planned += r.planned; g.actual += r.actual; g.onTime += r.onTime;
      g.late += r.late; g.pending += r.pending; g.scoreSum += r.score; g.n++;
    });
    return Object.values(map)
      .map((g) => ({
        ...g, score: calcScore(g.planned, g.onTime, g.late),
        completion: g.planned ? +((g.actual / g.planned) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.score - a.score);
  }, [filtered, scoringView]);

  // Score Summary page: each employee's avg score for their latest week, month, year.
  const scoreSummary = useMemo(() => {
    const byPerson = {};
    filtered.forEach((r) => {
      const p = (byPerson[r.name] ||= { name: r.name, dept: r.dept, rows: [] });
      p.rows.push(r);
      p.dept = r.dept;
    });
    // Score for a set of rows using the Looker formula on their summed totals.
    const periodScore = (rs) => {
      if (!rs.length) return null;
      let planned = 0, onTime = 0, late = 0;
      rs.forEach((r) => { planned += r.planned; onTime += r.onTime; late += r.late; });
      return calcScore(planned, onTime, late);
    };
    // Turn "MM/YYYY" into a sortable number YYYYMM (e.g. 09/2027 -> 202709).
    const monthRank = (my) => {
      const m = String(my).match(/^(\d{1,2})\/(\d{4})$/);
      return m ? Number(m[2]) * 100 + Number(m[1]) : -1;
    };
    const isValidYear = (y) => /^\d{4}$/.test(String(y).trim());
    const result = Object.values(byPerson).map((p) => {
      // latest week (numeric)
      const weeks = [...new Set(p.rows.map((r) => r.week).filter(Boolean))];
      const latestWeek = weeks.sort((a, b) => Number(b) - Number(a))[0];
      const weekly = latestWeek != null ? periodScore(p.rows.filter((r) => r.week === latestWeek)) : periodScore(p.rows);
      // latest month — sort by YYYYMM, ignore malformed values
      const months = [...new Set(p.rows.map((r) => r.monthYear).filter((m) => monthRank(m) > 0))];
      const latestMonth = months.sort((a, b) => monthRank(b) - monthRank(a))[0];
      const monthly = latestMonth ? periodScore(p.rows.filter((r) => r.monthYear === latestMonth)) : null;
      // latest year — only real 4-digit years, fall back to the date's year
      const years = [...new Set(p.rows.map((r) => isValidYear(r.year) ? r.year : String(r.date.getFullYear())).filter(isValidYear))];
      const latestYear = years.sort((a, b) => Number(b) - Number(a))[0];
      const yearly = latestYear ? periodScore(p.rows.filter((r) => (isValidYear(r.year) ? r.year : String(r.date.getFullYear())) === latestYear)) : null;
      return { name: p.name, dept: p.dept, weekly, monthly, yearly };
    });
    return result.sort((a, b) => (b.yearly ?? -Infinity) - (a.yearly ?? -Infinity));
  }, [filtered]);


  // Sort Score Summary by the clicked column (name / dept / weekly / monthly / yearly).
  const scoreSummarySorted = useMemo(() => {
    const { key, dir } = scoreSort;
    const arr = [...scoreSummary];
    arr.sort((a, b) => {
      let av = a[key], bv = b[key];
      if (key === "name" || key === "dept") {
        return dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      }
      av = av ?? -Infinity; bv = bv ?? -Infinity;
      return dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [scoreSummary, scoreSort]);

  // KPIs
  const kpis = useMemo(() => {
    const byPerson = {};
    filtered.forEach((r) => { (byPerson[r.name] ||= { active: r.active }).active = r.active; });
    const people = Object.keys(byPerson);
    const total = people.length;
    const active = people.filter((p) => byPerson[p].active === "Active").length;
    const records = filtered.length;
    const planned = filtered.reduce((s, r) => s + r.planned, 0);
    const actual = filtered.reduce((s, r) => s + r.actual, 0);
    const pending = filtered.reduce((s, r) => s + r.pending, 0);
    const avg = records ? filtered.reduce((s, r) => s + r.score, 0) / records : 0;
    return {
      total, active, inactive: total - active, records, planned, actual, pending,
      avg: avg.toFixed(2),
      completion: planned ? ((actual / planned) * 100).toFixed(1) : "0",
      productivity: (50 + avg).toFixed(1),
      efficiency: planned ? (((actual - pending) / planned) * 100).toFixed(1) : "0",
    };
  }, [filtered]);

  const sp = (n) => Array.from({ length: 10 }, (_, i) => 40 + Math.sin(i + n) * 25 + n * 3);

  // dept aggregation
  const deptAgg = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const d = (map[r.dept] ||= { dept: r.dept, count: 0, score: 0, planned: 0, actual: 0, pending: 0, onTime: 0, late: 0 });
      d.count++; d.score += r.score; d.planned += r.planned; d.actual += r.actual;
      d.pending += r.pending; d.onTime += r.onTime; d.late += r.late;
    });
    return Object.values(map).map((d) => ({
      ...d, avg: calcScore(d.planned, d.onTime, d.late),
      completion: d.planned ? +((d.actual / d.planned) * 100).toFixed(1) : 0,
      onTimePct: d.actual ? +((d.onTime / d.actual) * 100).toFixed(1) : 0,
      latePct: d.actual ? +((d.late / d.actual) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.avg - a.avg);
  }, [filtered]);

  const ranked = useMemo(() => [...empAgg].sort((a, b) => b.score - a.score), [empAgg]);
  const top10 = ranked.slice(0, 10);
  const bottom10 = ranked.slice(-10).reverse();
  const maxPending = Math.max(...empAgg.map((r) => r.pending), 1);

  // AI insights
  const insights = useMemo(() => {
    const out = [];
    if (deptAgg.length) {
      const worstPending = [...deptAgg].sort((a, b) => b.pending - a.pending)[0];
      out.push({ type: "warn", text: `${worstPending.dept} has the highest pending activities (${fmt(worstPending.pending)}).` });
      out.push({ type: "good", text: `${deptAgg[0].dept} leads with the best (highest) average score of ${deptAgg[0].avg}.` });
    }
    if (top10[0]) out.push({ type: "good", text: `Best performer is ${top10[0].name} (${top10[0].dept}) with the highest score (${top10[0].score}).` });
    out.push({ type: kpis.completion >= 65 ? "good" : "warn", text: `Overall completion rate is ${kpis.completion}% across ${fmt(kpis.records)} activity records.` });
    if (kpis.inactive) out.push({ type: "warn", text: `${kpis.inactive} employees are currently inactive — review recommended.` });
    return out;
  }, [deptAgg, top10, kpis]);

  const notifications = useMemo(() => {
    const list = [];
    list.push({
      icon: Activity, color: t.primary,
      text: `${fmt(rows.length)} records loaded from MongoDB`, time: "just now"
    });
    if (kpis.pending > 0)
      list.push({
        icon: Clock, color: t.warning,
        text: `${fmt(kpis.pending)} pending activities across ${kpis.total} employees`, time: "live"
      });
    const lowPerformers = empAgg.filter((e) => e.score < RAG_LOW).length;
    if (lowPerformers > 0)
      list.push({
        icon: TrendingDown, color: t.danger,
        text: `Low score alert: ${lowPerformers} employees in the red band`, time: "live"
      });
    if (kpis.inactive > 0)
      list.push({
        icon: UserX, color: t.sub,
        text: `${fmt(kpis.inactive)} inactive employees detected`, time: "live"
      });
    if (top10[0])
      list.push({
        icon: Trophy, color: t.success,
        text: `Top performer: ${top10[0].name} (${top10[0].dept}) · score ${top10[0].score}`, time: "live"
      });
    return list;
  }, [rows.length, kpis, empAgg, top10, t]);

  const visibleRows = sorted.slice(0, visibleCount);
  useEffect(() => { sortedLenRef.current = sorted.length; }, [sorted.length]);
  const onTableScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120 && visibleCount < sorted.length) {
      setVisibleCount((c) => Math.min(c + STEP, sorted.length));
    }
  };

  // Build export columns + rows based on the CURRENT page (tab).
  const exportData = () => {
    switch (tab) {
      case "dept":
        return {
          title: "Department Performance Report",
          cols: ["Rank", "Department", "Records", "Avg Score", "Pending", "Completion %", "On-Time %", "Late %"],
          rows: deptAgg.map((d, i) => [i + 1, d.dept, d.count, d.avg, d.pending, d.completion + "%", d.onTimePct + "%", d.latePct + "%"]),
        };
      case "monthly":
        return {
          title: "Monthly Analytics Report",
          cols: ["Month", "Score", "Activities Done", "Completion %"],
          rows: MONTHLY.map((m) => [m.month, m.score, m.activities, m.completion + "%"]),
        };
      case "yearly":
        return {
          title: "Yearly Analytics Report",
          cols: ["Year", "Score", "Productivity %", "Activities Done"],
          rows: YEARLY.map((y) => [y.year, y.score, y.productivity + "%", y.activities]),
        };
      case "scores":
        return {
          title: "Score Summary Report",
          cols: ["Rank", "Name", "Weekly Score", "Monthly Score", "Yearly Score"],
          rows: scoreSummary.map((p, i) => [i + 1, p.name, p.weekly ?? "—", p.monthly ?? "—", p.yearly ?? "—"]),
        };
      case "board":
        return {
          title: "Leaderboard Report",
          cols: ["Rank", "Name", "Department", "Score"],
          rows: [...ranked].map((r, i) => [i + 1, r.name, r.dept, r.score]),
        };
      case "emp":
      default:
        return {
          title: "Employee Performance Report",
          cols: ["Rank", "Name", "Department", "Score", "Planned", "Actual", "OnTime", "Late", "Pending", "Status"],
          rows: sorted.map((r, i) => [i + 1, r.name, r.dept, r.score, r.planned, r.actual, r.onTime, r.late, r.pending, r.active]),
        };
    }
  };
  const dl = (content, name, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const stamp = new Date().toISOString().slice(0, 10);
  const fileBase = () => (tab || "report");

  const exportCSV = () => {
    const { cols, rows } = exportData();
    const csv = [cols.join(","), ...rows.map((r) => r.join(","))].join("\n");
    dl(csv, `${fileBase()}_${stamp}.csv`, "text/csv;charset=utf-8");
  };
  const exportExcel = () => {
    const { cols, rows } = exportData();
    const head = `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;
    const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
    dl(html, `${fileBase()}_${stamp}.xls`, "application/vnd.ms-excel");
  };
  const exportJSON = () => {
    const { cols, rows } = exportData();
    const data = rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
    dl(JSON.stringify(data, null, 2), `${fileBase()}_${stamp}.json`, "application/json");
  };
  const exportPDF = () => {
    const { title, cols, rows } = exportData();
    const head = `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;
    const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${title} — ${stamp}</title>
      <style>body{font-family:Arial,sans-serif;padding:30px;color:#202124}
      h1{font-size:20px;color:#1A73E8}p{color:#5F6368;font-size:12px}
      table{border-collapse:collapse;width:100%;margin-top:14px;font-size:11px}
      th{background:#1A73E8;color:#fff;padding:7px;text-align:left}
      td{border:1px solid #DADCE0;padding:6px}
      tr:nth-child(even) td{background:#F5F6F8}</style></head>
      <body><h1>${title}</h1><p>Generated ${new Date().toLocaleString()} · ${rows.length} rows · ${user.fullName} (${user.role})</p>
      <table>${head}${body}</table>
      <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  };
  const exportPrint = () => window.print();

  const REPORTS = [
    { label: "PDF Report", desc: "Print-ready document", icon: FileText, color: t.danger, fn: exportPDF },
    { label: "Excel (.xls)", desc: "Open in Excel / Sheets", icon: FileSpreadsheet, color: t.success, fn: exportExcel },
    { label: "CSV Data", desc: "Comma-separated values", icon: Download, color: t.primary, fn: exportCSV },
    { label: "JSON Export", desc: "For developers / API", icon: FileJson, color: t.warning, fn: exportJSON },
    { label: "Print / Screenshot", desc: "Current dashboard view", icon: Printer, color: t.sub, fn: exportPrint },
  ];

  const Th = ({ k, children, align = "left" }) => (
    <th onClick={() => k && setSort({ key: k, dir: sort.key === k && sort.dir === "desc" ? "asc" : "desc" })}
      style={{
        padding: "11px 12px", textAlign: align, fontSize: 12, fontWeight: 800, color: t.header,
        cursor: k ? "pointer" : "default", userSelect: "none", position: "sticky", top: 0,
        background: t.hover, whiteSpace: "nowrap"
      }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {children}
        {k && (sort.key === k
          ? (sort.dir === "desc" ? <ChevronDown size={13} /> : <ChevronUp size={13} />)
          : <ArrowUpDown size={12} style={{ opacity: .4 }} />)}
      </span>
    </th>
  );

  const NAV = [
    { id: "dept", label: "Department Score", icon: Building2 },
    { id: "emp", label: "Employee Performance", icon: Users },
    { id: "monthly", label: "Monthly Analytics", icon: CalendarDays },
    { id: "yearly", label: "Yearly Analytics", icon: CalendarRange },
    { id: "scores", label: "Score Summary", icon: Award },
    { id: "board", label: "Leaderboard", icon: Trophy },
    ...(isAdmin ? [{ id: "admin", label: "User Management", icon: Settings }] : []),
  ];

  if (!user) return <LoginPage onLogin={setUser} />;

  if (loading) return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      fontFamily: "'Inter',sans-serif", background: t.bg
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, border: `3px solid ${t.border}`,
          borderTopColor: t.primary, borderRadius: "50%", animation: "spin .7s linear infinite",
          margin: "0 auto 16px"
        }} />
        <div style={{ color: t.text, fontWeight: 600, fontSize: 16 }}>Loading data from Database…</div>
        <div style={{ color: t.sub, fontSize: 13, marginTop: 6 }}>This may take a few seconds for large datasets</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // Renders an Employee-Performance-style table for a given list (period-scoped).
  const empDetailTable = (list) => (
    <div className="lk-scroll" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>
          {["Rank", "Employee", "Department", "Score", "Planned", "Actual", "On-Time", "Late", "Pending", "Status"].map((h, i) => (
            <th key={h} style={{
              padding: "11px 12px", textAlign: i >= 3 && i <= 8 ? "right" : "left",
              fontSize: 12, fontWeight: 600, color: t.header, position: "sticky", top: 0,
              background: t.hover, whiteSpace: "nowrap"
            }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {list.length === 0 && (
            <tr><td colSpan={10} style={{ padding: "24px", textAlign: "center", color: t.sub }}>No employee data for this period.</td></tr>
          )}
          {list.map((r, i) => (
            <tr key={r.id} className="lk-row" style={{ borderTop: `1px solid ${t.border}` }}
              onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "11px 12px", color: t.sub, fontWeight: 600 }}>{i + 1}</td>
              <td style={{ padding: "11px 12px", fontWeight: 600 }}>{r.name}</td>
              <td style={{ padding: "11px 12px", color: t.sub }}>{r.dept}</td>
              <td style={{
                padding: "11px 12px", textAlign: "right", fontWeight: 600,
                background: scoreBg(r.score), color: scoreColor(r.score)
              }}>{r.score}</td>
              <td style={{ padding: "11px 12px", textAlign: "right" }}>{fmt(r.planned)}</td>
              <td style={{ padding: "11px 12px", textAlign: "right" }}>{fmt(r.actual)}</td>
              <td style={{ padding: "11px 12px", textAlign: "right" }}>{fmt(r.onTime)}</td>
              <td style={{ padding: "11px 12px", textAlign: "right" }}>{fmt(r.late)}</td>
              <td style={{ padding: "11px 12px", textAlign: "right", background: pendingBg(r.pending, Math.max(...list.map(x => x.pending), 1)) }}>{fmt(r.pending)}</td>
              <td style={{ padding: "11px 12px" }}>
                <span style={{
                  padding: "3px 9px", borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                  background: r.active === "Active" ? `${t.success}22` : `${t.sub}22`,
                  color: r.active === "Active" ? t.success : t.sub
                }}>{r.active}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Pill-style period selector buttons.
  const periodPicker = (options, activeKey, onPick, labelOf, keyOf) => (
    <div className="lk-period-picker" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      {options.map((o) => {
        const k = keyOf(o), on = String(k) === String(activeKey);
        return (
          <button key={k} onClick={() => onPick(k)} style={{
            padding: "6px 13px", borderRadius: 20,
            border: `1px solid ${on ? t.primary : t.border}`, cursor: "pointer", fontSize: 12.5,
            fontWeight: on ? 600 : 500, background: on ? `${t.primary}14` : t.card,
            color: on ? t.primary : t.text, whiteSpace: "nowrap"
          }}>{labelOf(o)}</button>
        );
      })}
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", width: "100%", maxWidth: "100vw", overflowX: "hidden",
      background: dark
        ? "radial-gradient(1200px 700px at 80% -5%, rgba(138,180,248,.06), transparent 60%), " + t.bg
        : "radial-gradient(1200px 700px at 80% -5%, rgba(26,115,232,.05), transparent 60%), " + t.bg,
      color: t.text,
      fontFamily: "'Inter','Google Sans','Segoe UI',Roboto,system-ui,sans-serif",
      transition: "background .35s cubic-bezier(.4,0,.2,1)", WebkitFontSmoothing: "antialiased"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
        @keyframes popIn{0%{opacity:0;transform:translateY(8px) scale(.98)}100%{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        html,body,#root{margin:0;padding:0;width:100%;max-width:100%;overflow-x:hidden}
        input,button{font-family:inherit}
        button{transition:background .2s ease,color .2s ease,transform .12s ease,box-shadow .2s ease,opacity .2s ease}
        button:active{transform:scale(.97)}
        .lk-field:focus{box-shadow:0 0 0 3px ${t.primary}33!important;border-color:${t.primary}!important}
        ::selection{background:${t.primary}33}
        ::-webkit-scrollbar{width:10px;height:10px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${t.border};border-radius:10px;border:2px solid transparent;background-clip:padding-box}
        ::-webkit-scrollbar-thumb:hover{background:${t.sub}}
        .lk-scroll{scrollbar-width:thin;scrollbar-color:${t.border} transparent}
        .lk-scroll::-webkit-scrollbar{width:10px;height:10px}
        .lk-scroll::-webkit-scrollbar-track{background:transparent}
        .lk-scroll::-webkit-scrollbar-thumb{background:${t.border};border-radius:10px;border:2px solid transparent;background-clip:padding-box}
        .lk-scroll::-webkit-scrollbar-thumb:hover{background:${t.primary}}
      .lk-scroll thead th{position:sticky;top:0;z-index:2;backdrop-filter:blur(6px)}
        @media(max-width:860px){.lk-scroll thead th{top:58px!important;z-index:20!important}}
        .lk-row{transition:background .15s ease}
        /* UI upgrade: subtle table zebra + crisper hover */
        .lk-scroll tbody tr:nth-child(even){background:${dark ? "rgba(255,255,255,.015)" : "rgba(60,64,67,.012)"}}
        .lk-scroll tbody tr:hover{background:${t.hover}!important}
        /* UI upgrade: nav items get a smooth slide on hover */
        .lk-nav-item{transition:background .18s ease,color .18s ease,padding-left .18s ease}
        .lk-nav-item:hover{padding-left:18px!important}
        /* UI upgrade: popovers animate in */
        .lk-daterange-pop,.lk-pop{animation:popIn .18s cubic-bezier(.4,0,.2,1) both}
        .lk-mobtog{display:none}
        .lk-header-actions{min-width:0}
        .lk-panel,.lk-kpi-card,.lk-chart-grid,.lk-ai-grid{min-width:0}
        .lk-panel-body{min-width:0}
        .lk-scroll{max-width:100%;overflow-x:auto!important;-webkit-overflow-scrolling:touch;overscroll-behavior-inline:contain}
        .lk-scroll table{min-width:max-content}
        .lk-chart-grid > *, .lk-ai-grid > *{min-width:0}
        .lk-period-picker{max-width:100%;overflow-x:auto;flex-wrap:nowrap!important;padding-bottom:3px;scrollbar-width:none}
        .lk-period-picker::-webkit-scrollbar{display:none}
        /* NEW: table density toggle */
        .lk-density-compact table td, .lk-density-compact table th{padding-top:5px!important;padding-bottom:5px!important;font-size:12px!important}
        .lk-density-compact .lk-row td{padding-top:5px!important;padding-bottom:5px!important}

        /* Sidebar becomes an off-canvas drawer on tablet/mobile. */
  @media(max-width:860px){
          .lk-sidebar{position:fixed!important;z-index:60!important;height:100dvh!important;width:min(280px,86vw)!important;transform:translateX(-110%);transition:transform .32s cubic-bezier(.4,0,.2,1);box-shadow:0 18px 50px rgba(0,0,0,.28)}
          .lk-sidebar.open{transform:none!important}
          .lk-maincol{margin-left:0!important;padding-top:0!important;width:100%!important}
         .lk-header{position:static!important;top:auto!important;left:auto!important;right:auto!important;width:100%!important;min-height:58px;flex-wrap:wrap!important}
          .lk-titlebar{position:static!important;top:auto!important;background:transparent!important}
          .lk-desk{display:none!important}
          .lk-mobtog{display:grid!important;place-items:center;flex:0 0 36px;width:36px;height:36px;border-radius:9px!important;background:${t.hover}!important}
        }

        /* Tablet */
        @media(max-width:900px){
          .lk-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}
          .lk-chart-grid{grid-template-columns:minmax(0,1fr)!important}
          .lk-main{padding:16px 18px 24px!important}
          .lk-titlebar{padding:18px 18px 6px!important}
          .lk-panel-head{padding:14px 16px!important}
          .lk-panel-body{padding:16px!important}
        }

        /* Date-range popover: keep it inside the viewport. */
        @media(max-width:680px){
          .lk-daterange-pop{position:fixed!important;left:10px!important;right:10px!important;top:68px!important;width:auto!important;max-width:none!important;max-height:calc(100dvh - 82px)!important;overflow-y:auto!important;flex-direction:column!important;flex-wrap:nowrap!important;gap:10px!important;padding:12px!important}
          .lk-daterange-pop > div:first-child{width:100%;min-width:0!important;border-right:none!important;border-bottom:1px solid ${t.border};padding-right:0!important;padding-bottom:8px!important;flex-direction:row!important;flex-wrap:nowrap!important;overflow-x:auto!important}
          .lk-daterange-pop > div:first-child button{white-space:nowrap;flex:0 0 auto}
          .lk-daterange-pop > div:nth-child(2){width:100%!important}
          .lk-calendar-pair{display:grid!important;grid-template-columns:repeat(2,minmax(188px,1fr))!important;overflow-x:auto!important;padding-bottom:4px}
          .lk-calendar{width:100%!important}
          .lk-date-actions{position:sticky;bottom:-12px;background:${t.card};padding:10px 0 2px}
        }

        /* Mobile */
        @media(max-width:640px){
          html{font-size:15px}
          body{min-width:0;touch-action:manipulation}
          .lk-header{padding:10px 12px!important;gap:8px!important}
          .lk-header-actions{margin-left:auto!important;gap:7px!important;flex:0 0 auto}
          .lk-header-actions > button,.lk-header-actions > div > button{min-width:36px;min-height:36px}
          .lk-search{order:10!important;flex:1 0 100%!important;max-width:none!important;width:100%!important;padding:9px 12px!important}
          .lk-search input{font-size:16px!important}
          .lk-search kbd{display:none!important}
          .lk-titlebar{padding:14px 12px 6px!important;gap:12px!important;align-items:flex-start!important}
          .lk-title-copy{width:100%}
          .lk-title-copy p{line-height:1.45}
          .lk-filters{width:100%!important;display:grid!important;grid-template-columns:1fr!important;gap:8px!important}
          .lk-filters > *{width:100%!important;min-width:0!important;max-width:none!important}
          .lk-filters > span{justify-content:flex-start!important}
          .lk-filters > button,.lk-multiselect > button,.lk-date-picker > button{width:100%!important;min-height:44px;justify-content:center!important}
          .lk-multiselect{min-width:0!important;width:100%!important}
          .lk-multiselect-menu{left:0!important;right:auto!important;width:min(280px,calc(100vw - 24px))!important;max-height:min(360px,65dvh)!important;overflow:auto!important}
          .lk-date-picker{width:100%!important}
          .lk-date-button{width:100%!important;justify-content:center!important}
          .lk-main{padding:12px 12px 24px!important;gap:14px!important}
          .lk-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
          .lk-kpi-card{padding:14px!important;border-radius:14px!important;gap:8px!important}
          .lk-kpi-card:hover{transform:none!important}
          .lk-kpi-val{font-size:clamp(20px,7vw,26px)!important}
          .lk-ai-grid{grid-template-columns:minmax(0,1fr)!important}
          .lk-panel{border-radius:14px!important}
          .lk-panel-head{padding:13px 14px!important}
          .lk-panel-body{padding:12px!important}
          .lk-panel-head h3{font-size:14px!important;line-height:1.35}
          .lk-chart-grid{gap:14px!important}
         .lk-scroll{margin:0 -12px;padding:0 12px;overflow-x:auto!important;-webkit-overflow-scrolling:touch}
          .lk-scroll table{font-size:12px!important}
          .lk-scroll th,.lk-scroll td{padding:9px 8px!important;white-space:nowrap}
          h1{font-size:19px!important}
          .lk-export-label{display:none!important}
          .lk-updated{display:none!important}
          .lk-report-pop,.lk-notification-pop,.lk-user-pop{position:fixed!important;left:10px!important;right:10px!important;top:62px!important;width:auto!important;max-height:calc(100dvh - 76px)!important;overflow-y:auto!important}
          .lk-modal-backdrop{padding:10px!important;align-items:end!important}
          .lk-admin-modal{max-width:none!important;max-height:92dvh!important;overflow-y:auto!important;border-radius:18px 18px 0 0!important;padding:18px!important}
          .lk-admin-selects{flex-direction:column!important}
          .lk-modal-actions{display:grid!important;grid-template-columns:1fr 1fr!important}
          .lk-modal-actions button{width:100%!important;min-height:44px}
          .lk-back-top{right:12px!important;bottom:12px!important;width:42px!important;height:42px!important}
        }

        /* Small phones */
        @media(max-width:460px){
          .lk-kpis{grid-template-columns:1fr!important}
          .lk-header-actions{gap:4px!important}
          .lk-header-actions > div:nth-of-type(1){display:none!important}
          .lk-panel-body{padding:11px!important}
          .lk-scroll{margin:0 -11px;padding:0 11px}
          .lk-calendar-pair{grid-template-columns:1fr!important;overflow:visible!important}
          .lk-calendar{min-width:0!important}
          .lk-date-actions{display:grid!important;grid-template-columns:1fr 1fr!important}
          .lk-date-actions button{width:100%!important}
        }

        @media(max-width:360px){
          .lk-main,.lk-titlebar,.lk-header{padding-left:9px!important;padding-right:9px!important}
          .lk-header-actions button{width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important;padding:0!important}
          .lk-kpi-card{padding:13px!important}
        }
      `}</style>

      {/* SIDEBAR */}
      <aside className={`lk-sidebar ${sidebar ? "open" : ""}`} style={{
        width: 240, background: t.card, borderRight: `1px solid ${t.border}`,
        padding: "20px 14px", display: "flex", flexDirection: "column", gap: 4,
        position: "fixed", left: 0, top: 0, height: "100vh",
        overflowY: "auto", overflowX: "hidden", zIndex: 45,
        WebkitOverflowScrolling: "touch"
      }}>
        <img src="/bhas2.png" alt="logo" style={{ height: 170, width: "auto", objectFit: "contain", display: "block", marginBottom: 8 , marginTop: "-40px" }} />
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: t.sub, letterSpacing: ".8px",
          textTransform: "uppercase", padding: "0 12px 6px" , marginTop: "-50px"
        }}>Analytics</span>
        {NAV.map((n) => {
          const on = tab === n.id;
          return (
            <button key={n.id} onClick={() => { setTab(n.id); setSidebar(false); setNotifOpen(false); }} className="lk-nav-item" style={{
              position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
              border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13.5,
              fontWeight: on ? 600 : 500, textAlign: "left",
              background: on ? `${t.primary}14` : "transparent",
              color: on ? t.primary : t.text
            }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = t.hover; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
              {on && <span style={{
                position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                width: 3, height: 18, borderRadius: 3, background: t.primary
              }} />}
              <n.icon size={18} /> {n.label}
            </button>
          );
        })}
        <div style={{
          marginTop: "auto", padding: 13, borderRadius: 12, background: t.hover,
          fontSize: 11.5, color: t.sub, lineHeight: 1.5
        }}>
          <span style={{
            display: "inline-flex", width: 7, height: 7, borderRadius: "50%",
            background: t.success, marginRight: 6, verticalAlign: "middle"
          }} />
          Live · Database, auto-refresh every 5 min.
        </div>
        <div style={{
          marginTop: "auto", padding: 13, borderRadius: 12, background: t.hover,
          fontSize: 11.5, color: t.sub, lineHeight: 1.5
        }}>
          © 2026 Bhaskar Silk Mills Pvt. Ltd. All Rights Reserved.
        </div>
      </aside>
      {sidebar && <div onClick={() => setSidebar(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", backdropFilter: "blur(2px)", zIndex: 55 }} />}

      {/* MAIN */}
      <div className="lk-maincol" style={{
        display: "flex", flexDirection: "column", minWidth: 0,
        marginLeft: 240, paddingTop: 57
      }}>
        {/* TOPBAR */}
        <header className="lk-header" style={{
          display: "flex", alignItems: "center", gap: 14, padding: "13px 24px",
          background: dark ? "rgba(38,40,44,.92)" : "rgba(255,255,255,.92)", backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${t.border}`, position: "fixed", top: 0, left: 240, right: 0, zIndex: 50
        }}>
          <button onClick={() => setSidebar(true)} className="lk-mobtog" style={{ border: "none", background: "transparent", color: t.text, cursor: "pointer", padding: 4 }}>
            <Menu size={20} />
          </button>
          <div className="lk-search" style={{
            display: "flex", alignItems: "center", gap: 9, background: t.hover,
            borderRadius: 11, padding: "9px 14px", flex: 1, maxWidth: 440,
            border: `1px solid transparent`, transition: "border-color .2s"
          }}>
            <Search size={16} color={t.sub} />
            <input id="lk-search-input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees or departments…  (press / )" style={{
                border: "none", outline: "none",
                background: "transparent", color: t.text, fontSize: 13.5, width: "100%", boxShadow: "none"
              }} />
            {search
              ? <X size={15} color={t.sub} style={{ cursor: "pointer" }} onClick={() => setSearch("")} />
              : <kbd style={{
                fontSize: 11, fontWeight: 600, color: t.sub, border: `1px solid ${t.border}`,
                borderRadius: 5, padding: "1px 6px", background: t.card
              }}>/</kbd>}
          </div>
          <div className="lk-header-actions" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            {/* NEW: last updated + manual refresh */}
            <span className="lk-updated" style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 12, color: t.sub, whiteSpace: "nowrap"
            }}>
              <Clock3 size={13} /> {timeAgo(lastUpdated)}
            </span>
            <button onClick={() => refreshData(true)} disabled={refreshing} title="Refresh data now"
              style={{
                border: `1px solid ${t.border}`, background: t.card, color: t.text, cursor: refreshing ? "wait" : "pointer",
                width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center"
              }}>
              <RefreshCw size={16} style={{ animation: refreshing ? "spin .7s linear infinite" : "none" }} />
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setReportOpen(!reportOpen)} style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 22, border: `1px solid ${t.border}`,
                background: t.card, color: t.text, fontSize: 13, fontWeight: 500, cursor: "pointer"
              }}>
                <Download size={15} /> <span className="lk-export-label">Export Report</span>
                <ChevronDown size={14} style={{ transform: reportOpen ? "rotate(180deg)" : "none", transition: ".2s" }} />
              </button>
              {reportOpen && (
                <>
                  <div onClick={() => setReportOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                  <div className="lk-pop lk-report-pop" style={{
                    position: "absolute", right: 0, top: "calc(100% + 10px)", width: 270,
                    background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, zIndex: 61,
                    boxShadow: "0 10px 32px rgba(60,64,67,.22)", overflow: "hidden", animation: "rise .15s both"
                  }}>
                    <div style={{
                      padding: "11px 16px", borderBottom: `1px solid ${t.border}`, fontWeight: 600,
                      fontSize: 13.5, color: t.text
                    }}>Export Center</div>
                    {REPORTS.map((rp, i) => (
                      <button key={i} onClick={() => { rp.fn(); setReportOpen(false); }} style={{
                        width: "100%",
                        display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", border: "none",
                        background: "transparent", cursor: "pointer", textAlign: "left",
                        borderBottom: i < REPORTS.length - 1 ? `1px solid ${t.border}` : "none"
                      }}
                        onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "grid",
                          placeItems: "center", background: `${rp.color}1F`, color: rp.color
                        }}>
                          <rp.icon size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{rp.label}</div>
                          <div style={{ fontSize: 11, color: t.sub }}>{rp.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <button onClick={() => setNotifOpen(!notifOpen)} style={{
                position: "relative",
                border: "none", background: "transparent", color: t.text, cursor: "pointer", padding: 4
              }}>
                <Bell size={20} />
                <span style={{
                  position: "absolute", top: 0, right: 0, width: 8, height: 8,
                  borderRadius: "50%", background: t.danger
                }} />
              </button>
              {notifOpen && (
                <>
                  <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                  <div className="lk-pop lk-notification-pop" style={{
                    position: "absolute", right: 0, top: "calc(100% + 10px)", width: 300,
                    background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, zIndex: 60,
                    boxShadow: "0 8px 28px rgba(60,64,67,.22)", overflow: "hidden", animation: "rise .15s both"
                  }}>
                    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.border}`, fontWeight: 600, fontSize: 14 }}>Notifications</div>
                    {notifications.map((n, i) => (
                      <div key={i} style={{
                        display: "flex", gap: 11, padding: "12px 16px",
                        borderBottom: i < notifications.length - 1 ? `1px solid ${t.border}` : "none"
                      }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                          display: "grid", placeItems: "center", background: `${n.color}22`, color: n.color
                        }}>
                          <n.icon size={15} />
                        </div>
                        <div style={{ fontSize: 12.5 }}>
                          <div style={{ color: t.text }}>{n.text}</div>
                          <div style={{ color: t.sub, fontSize: 11, marginTop: 2 }}>{n.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setDark(!dark)} style={{
              border: "none", background: t.hover,
              color: t.text, cursor: "pointer", width: 36, height: 36, borderRadius: "50%",
              display: "grid", placeItems: "center"
            }}>
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setUserMenu(!userMenu)} style={{
                display: "flex", alignItems: "center", gap: 8,
                border: "none", background: "transparent", cursor: "pointer", padding: 0
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%", background: t.primary,
                  color: "#fff", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 13
                }}>
                  {(user.fullName || user.username || "?").charAt(0).toUpperCase()}
                </div>
              </button>
              {userMenu && (
                <>
                  <div onClick={() => setUserMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                  <div className="lk-pop lk-user-pop" style={{
                    position: "absolute", right: 0, top: "calc(100% + 10px)", width: 220,
                    background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, zIndex: 61,
                    boxShadow: "0 10px 32px rgba(60,64,67,.22)", overflow: "hidden", animation: "rise .15s both"
                  }}>
                    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{user.fullName}</div>
                      <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{user.email}</div>
                      <span style={{
                        display: "inline-block", marginTop: 7, padding: "2px 9px", borderRadius: 20,
                        fontSize: 11, fontWeight: 600, background: `${t.primary}1A`, color: t.primary
                      }}>
                        {user.role}{user.dept ? ` · ${user.dept}` : ""}
                      </span>
                    </div>
                    <button onClick={() => { setUser(null); setUserMenu(false); }} style={{
                      width: "100%",
                      display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", border: "none",
                      background: "transparent", cursor: "pointer", color: t.danger, fontSize: 13.5, fontWeight: 500
                    }}
                      onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <LogOut size={16} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* PAGE TITLE + FILTER BAR */}
        <div className="lk-titlebar" style={{
          display: "flex", flexWrap: "wrap", gap: 14, padding: "16px 24px 4px",
          alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 30,
          background: dark ? "rgba(27,28,31,.92)" : "rgba(245,246,248,.92)", backdropFilter: "blur(8px)"
        }}>
          <div className="lk-title-copy">
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-.6px", color: t.text }}>
              {(NAV.find((n) => n.id === tab) || {}).label}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: t.sub }}>
              Welcome back, {(user.fullName || user.username || "User").split(" ")[0]} · {kpis.records ? fmt(kpis.records) : 0} records in view
            </p>
          </div>
          <div className="lk-filters" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: t.sub, fontWeight: 500 }}>
              <Filter size={15} /> Filters
              {(() => {
                const n = fDept.length + fStatus.length + (search ? 1 : 0) + (dateRange.start ? 1 : 0);
                return n ? <span style={{
                  marginLeft: 2, minWidth: 18, height: 18, borderRadius: 9, padding: "0 5px",
                  background: t.primary, color: "#fff", fontSize: 11, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", justifyContent: "center"
                }}>{n}</span> : null;
              })()}
            </span>
            <MultiSelect t={t} label="Department" options={DEPARTMENTS} selected={fDept} setSelected={setFDept} />
            <MultiSelect t={t} label="Status" options={["Active", "Inactive", "#N/A", "Blank"]} selected={fStatus} setSelected={setFStatus} />
            <DateRangePicker t={t} range={dateRange} setRange={setDateRange} min={dataDateRange.min} max={dataDateRange.max} />
            {/* NEW: density toggle */}
            <button onClick={() => setDensity(density === "comfortable" ? "compact" : "comfortable")}
              title="Toggle table density"
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 22,
                border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: 13, fontWeight: 500, cursor: "pointer"
              }}>
              <Rows3 size={15} /> {density === "comfortable" ? "Compact" : "Comfortable"}
            </button>
            {(fDept.length || fStatus.length || search || dateRange.start) ? (
              <button onClick={() => { setFDept([]); setFStatus([]); setSearch(""); setDateRange({ start: null, end: null }); }} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 22,
                border: "none", background: `${t.danger}14`, color: t.danger, fontSize: 13,
                fontWeight: 600, cursor: "pointer"
              }}>
                <X size={14} /> Clear all
              </button>
            ) : null}
          </div>
        </div>

        <main className={`lk-main lk-density-${density}`}
          id="lk-main-scroll"
          style={{
            padding: "18px 24px 28px", display: "flex", flexDirection: "column", gap: 20,
            position: "relative"
          }}>
          {/* KPI GRID */}
          <div className="lk-kpis" style={{
            display: "grid", gap: 16,
            gridTemplateColumns: "repeat(auto-fill,minmax(215px,1fr))"
          }}>
            <KpiCard t={t} icon={Users} label="Total Employees" value={fmt(kpis.total)} growth={4.2} spark={sp(1)} delay={0} />
            <KpiCard t={t} icon={UserCheck} label="Active Employees" value={fmt(kpis.active)} growth={2.8} spark={sp(2)} delay={40} />
            <KpiCard t={t} icon={UserX} label="Inactive Employees" value={fmt(kpis.inactive)} growth={-1.5} spark={sp(3)} delay={80} />
            <KpiCard t={t} icon={Activity} label="Total Activities" value={fmt(kpis.planned)} growth={8.1} spark={sp(4)} delay={120} />
            <KpiCard t={t} icon={CheckCircle2} label="Completed Activities" value={fmt(kpis.actual)} growth={6.4} spark={sp(5)} delay={160} />
            <KpiCard t={t} icon={Clock} label="Pending Activities" value={fmt(kpis.pending)} growth={-3.2} spark={sp(6)} delay={200} />
            <KpiCard t={t} icon={Award} label="Average Score" value={kpis.avg} growth={1.9} spark={sp(7)} delay={240}
              valueColor={scoreColor(parseFloat(kpis.avg))} ragLabel={ragBand(parseFloat(kpis.avg)).label} />
            <KpiCard t={t} icon={TrendingUp} label="Completion Rate" value={`${kpis.completion}%`} growth={5.0} spark={sp(8)} delay={280} />
          </div>

          {/* AI INSIGHTS */}
          <Panel t={t} title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={16} color={t.primary} /> AI Analytics</span>}>
            <div className="lk-ai-grid" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
              {insights.map((ins, i) => (
                <div key={i} style={{
                  display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10,
                  background: ins.type === "good" ? `${t.success}14` : `${t.warning}1F`,
                  borderLeft: `3px solid ${ins.type === "good" ? t.success : t.warning}`
                }}>
                  <Sparkles size={16} color={ins.type === "good" ? t.success : t.warning} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>{ins.text}</span>
                </div>
              ))}
            </div>
          </Panel>

          {/* TAB CONTENT */}
          {tab === "dept" && (
            <>
              <Panel t={t} title="Department Performance Ranking" style={{ padding: 0 }}>
                <div className="lk-scroll" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr>
                      <Th>Rank</Th><Th>Department</Th><Th align="right">Records</Th>
                      <Th align="right">Score</Th><Th align="right">Pending</Th>
                      <Th align="right">Completion %</Th><Th align="right">On-Time %</Th><Th align="right">Late %</Th>
                    </tr></thead>
                    <tbody>
                      {deptAgg.map((d, i) => (
                        <tr key={d.dept} style={{ borderTop: `1px solid ${t.border}` }}>
                          <td style={{ padding: "11px 12px", fontWeight: 600, color: t.sub }}>{i + 1}</td>
                          <td style={{ padding: "11px 12px", fontWeight: 600 }}>{d.dept}</td>
                          <td style={{ padding: "11px 12px", textAlign: "right" }}>{fmt(d.count)}</td>
                          <td style={{
                            padding: "11px 12px", textAlign: "right", fontWeight: 600,
                            background: scoreBg(d.avg), color: scoreColor(d.avg)
                          }}>{d.avg}</td>
                          <td style={{
                            padding: "11px 12px", textAlign: "right",
                            background: pendingBg(d.pending, Math.max(...deptAgg.map(x => x.pending), 1))
                          }}>{fmt(d.pending)}</td>
                          <td style={{ padding: "11px 12px", textAlign: "right" }}>{d.completion}%</td>
                          <td style={{ padding: "11px 12px", textAlign: "right", color: t.success }}>{d.onTimePct}%</td>
                          <td style={{ padding: "11px 12px", textAlign: "right", color: t.danger }}>{d.latePct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <div className="lk-chart-grid" style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
                <Panel t={t} title="Department Comparison">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={deptAgg} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={t.border} horizontal={false} />
                      <XAxis type="number" stroke={t.sub} fontSize={11} />
                      <YAxis type="category" dataKey="dept" stroke={t.sub} fontSize={10.5} width={92} />
                      <Tooltip contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text }} />
                      <Bar dataKey="avg" radius={[0, 5, 5, 0]} name="Avg Score">
                        {deptAgg.map((d, i) => <Cell key={i} fill={scoreColor(d.avg)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
                <Panel t={t} title="Completion Rate by Department">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={deptAgg}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={t.primary} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={t.primary} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                      <XAxis dataKey="dept" stroke={t.sub} fontSize={9.5} angle={-30} textAnchor="end" height={70} interval={0} />
                      <YAxis stroke={t.sub} fontSize={11} />
                      <Tooltip contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text }} />
                      <Area type="monotone" dataKey="completion" stroke={t.primary} strokeWidth={2} fill="url(#g1)" name="Completion %" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Panel>
              </div>
            </>
          )}

          {tab === "emp" && (
            <Panel t={t} title={`Employee Performance · ${sorted.length} employees`} style={{ padding: 0 }}>
              <div ref={scrollRef} className="lk-scroll" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>
                    <Th>Rank</Th><Th k="name">Employee</Th><Th k="dept">Department</Th>
                    <Th k="score" align="right">Score</Th><Th k="planned" align="right">Planned</Th>
                    <Th k="actual" align="right">Actual</Th><Th k="onTime" align="right">On-Time</Th>
                    <Th k="late" align="right">Late</Th><Th k="pending" align="right">Pending</Th>
                    <Th k="active">Status</Th>
                  </tr></thead>
                  <tbody>
                    {visibleRows.length === 0 && (
                      <tr><td colSpan={10} style={{ padding: "40px 24px", textAlign: "center", color: t.sub }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No employees match your filters</div>
                        <div style={{ fontSize: 12.5 }}>Try clearing filters or widening the date range.</div>
                      </td></tr>
                    )}
                    {visibleRows.map((r, i) => (
                      <tr key={r.id} className="lk-row" style={{ borderTop: `1px solid ${t.border}` }}
                        onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "10px 12px", color: t.sub, fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.name}</td>
                        <td style={{ padding: "10px 12px", color: t.sub }}>{r.dept}</td>
                        <td style={{
                          padding: "10px 12px", textAlign: "right", fontWeight: 600,
                          background: scoreBg(r.score), color: scoreColor(r.score)
                        }}>{r.score}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(r.planned)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(r.actual)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(r.onTime)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(r.late)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", background: pendingBg(r.pending, maxPending) }}>{fmt(r.pending)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{
                            padding: "3px 9px", borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                            background: r.active === "Active" ? `${t.success}22` : `${t.sub}22`,
                            color: r.active === "Active" ? t.success : t.sub
                          }}>{r.active}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleCount < sorted.length && (
                  <div style={{ textAlign: "center", padding: "14px", fontSize: 12.5, color: t.sub }}>
                    Loading more… ({visibleCount} of {sorted.length})
                  </div>
                )}
              </div>
              <div style={{
                padding: "10px 18px", borderTop: `1px solid ${t.border}`,
                fontSize: 12.5, color: t.sub
              }}>
                Showing {Math.min(visibleCount, sorted.length)} of {sorted.length} employees
              </div>
            </Panel>
          )}

          {tab === "monthly" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Panel t={t} style={{ padding: 0 }}
                title={<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", width: "100%", justifyContent: "space-between" }}>
                  <span>Scoring View</span>
                  <select value={scoringView} onChange={(e) => setScoringView(e.target.value)}
                    style={{
                      padding: "8px 14px", borderRadius: 10, border: `1px solid ${t.border}`,
                      background: t.card, color: t.text, fontSize: 13, fontWeight: 600, cursor: "pointer", outline: "none"
                    }}>
                    <option value="doer">Doer Name Wise Score</option>
                    <option value="dept">Department Wise Score</option>
                    <option value="week">Weekly Score</option>
                    <option value="month">Monthly Score</option>
                    <option value="year">Yearly Score</option>
                  </select>
                </div>}>
                <div className="lk-scroll" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr>
                      {["Rank", scoringView === "doer" ? "Doer Name" : scoringView === "dept" ? "Department" : scoringView === "week" ? "Week" : scoringView === "month" ? "Month & Year" : "Year",
                        "Score", "Planned", "Completed", "Pending", "Completion %"].map((h, i) => (
                          <th key={h} style={{
                            padding: "11px 12px", textAlign: i >= 2 ? "right" : "left",
                            fontSize: 12, fontWeight: 600, color: t.header, position: "sticky", top: 0,
                            background: t.hover, whiteSpace: "nowrap"
                          }}>{h}</th>
                        ))}
                    </tr></thead>
                    <tbody>
                      {scoringData.length === 0 && (
                        <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: t.sub }}>No data for this view.</td></tr>
                      )}
                      {scoringData.map((g, i) => (
                        <tr key={`${g.label}-${i}`} className="lk-row" style={{ borderTop: `1px solid ${t.border}` }}
                          onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                          <td style={{ padding: "11px 12px", color: t.sub, fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ padding: "11px 12px", fontWeight: 600 }}>{g.label}</td>
                          <td style={{
                            padding: "11px 12px", textAlign: "right", fontWeight: 600,
                            background: scoreBg(g.score), color: scoreColor(g.score)
                          }}>{g.score}</td>
                          <td style={{ padding: "11px 12px", textAlign: "right" }}>{fmt(g.planned)}</td>
                          <td style={{ padding: "11px 12px", textAlign: "right" }}>{fmt(g.actual)}</td>
                          <td style={{ padding: "11px 12px", textAlign: "right" }}>{fmt(g.pending)}</td>
                          <td style={{ padding: "11px 12px", textAlign: "right" }}>{g.completion}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "10px 18px", borderTop: `1px solid ${t.border}`, fontSize: 12.5, color: t.sub }}>
                  {scoringData.length} groups · grouped by {scoringView === "doer" ? "doer name" : scoringView === "dept" ? "department" : scoringView === "week" ? "week" : scoringView === "month" ? "month & year" : "year"}
                </div>
              </Panel>

              <Panel t={t} title={`Monthly Breakdown · ${MONTHLY.length} months`} style={{ padding: 0 }}>
                <div className="lk-scroll" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr>
                      <Th>Month</Th><Th align="right">Score</Th>
                      <Th align="right">Activities Done</Th><Th align="right">Completion %</Th>
                      <Th align="right">Trend</Th>
                    </tr></thead>
                    <tbody>
                      {MONTHLY.map((m, i) => {
                        const prev = i > 0 ? MONTHLY[i - 1].score : m.score;
                        const up = m.score >= prev;
                        return (
                          <tr key={m.month} className="lk-row" style={{ borderTop: `1px solid ${t.border}` }}
                            onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                            <td style={{ padding: "11px 12px", fontWeight: 600 }}>{m.month}</td>
                            <td style={{
                              padding: "11px 12px", textAlign: "right", fontWeight: 600,
                              background: scoreBg(m.score), color: scoreColor(m.score)
                            }}>{m.score}</td>
                            <td style={{ padding: "11px 12px", textAlign: "right" }}>{fmt(m.activities)}</td>
                            <td style={{ padding: "11px 12px", textAlign: "right" }}>{m.completion}%</td>
                            <td style={{ padding: "11px 12px", textAlign: "right" }}>
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                color: up ? t.success : t.danger, fontWeight: 600, fontSize: 12
                              }}>
                                {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                {Math.abs(+(m.score - prev).toFixed(1))}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{
                  padding: "10px 18px", borderTop: `1px solid ${t.border}`,
                  fontSize: 12.5, color: t.sub
                }}>
                  {MONTHLY.length} months
                </div>
              </Panel>
            </div>
          )}

          {tab === "yearly" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Panel t={t} title={`Year-over-Year Summary · ${YEARLY.length} years`} style={{ padding: 0 }}>
                <div className="lk-scroll" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr>
                      <Th>Year</Th><Th align="right">Score</Th>
                      <Th align="right">Productivity %</Th><Th align="right">Activities Done</Th>
                      <Th align="right">YoY Growth</Th>
                    </tr></thead>
                    <tbody>
                      {YEARLY.map((y, i) => {
                        const prev = i > 0 ? YEARLY[i - 1].activities : y.activities;
                        const growth = prev ? +(((y.activities - prev) / prev) * 100).toFixed(1) : 0;
                        const up = growth >= 0;
                        return (
                          <tr key={y.year} className="lk-row" style={{
                            borderTop: `1px solid ${t.border}`,
                            cursor: "pointer", background: String(y.year) === String(activeYear) ? `${t.primary}0D` : "transparent"
                          }}
                            onClick={() => setSelYear(y.year)}
                            onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                            onMouseLeave={(e) => e.currentTarget.style.background = String(y.year) === String(activeYear) ? `${t.primary}0D` : "transparent"}>
                            <td style={{ padding: "11px 12px", fontWeight: 600 }}>{y.year}</td>
                            <td style={{
                              padding: "11px 12px", textAlign: "right", fontWeight: 600,
                              background: scoreBg(y.score), color: scoreColor(y.score)
                            }}>{y.score}</td>
                            <td style={{ padding: "11px 12px", textAlign: "right" }}>{y.productivity}%</td>
                            <td style={{ padding: "11px 12px", textAlign: "right" }}>{fmt(y.activities)}</td>
                            <td style={{ padding: "11px 12px", textAlign: "right" }}>
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                color: up ? t.success : t.danger, fontWeight: 600, fontSize: 12
                              }}>
                                {i === 0 ? "—" : <>{up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{Math.abs(growth)}%</>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{
                  padding: "10px 18px", borderTop: `1px solid ${t.border}`,
                  fontSize: 12.5, color: t.sub
                }}>
                  {YEARLY.length} years · click a year to see its employees below
                </div>
              </Panel>

              <Panel t={t} style={{ padding: 0 }}
                title={<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span>Employee Performance · {activeYear || "—"}</span>
                  <span style={{ fontSize: 12, color: t.sub, fontWeight: 400 }}>({yearEmployees.length} employees)</span>
                </div>}
                action={periodPicker(YEARLY, activeYear, setSelYear, (y) => y.year, (y) => y.year)}>
                {empDetailTable(yearEmployees)}
              </Panel>
            </div>
          )}

          {tab === "scores" && (
            <Panel t={t} title={`Score Summary · ${scoreSummary.length} employees`} style={{ padding: 0 }}>
              <div className="lk-scroll" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>
                    {[
                      { label: "Rank", key: null, align: "left" },
                      { label: "Name", key: "name", align: "left" },
                      { label: "Department", key: "dept", align: "left" },
                      { label: "Weekly Score", key: "weekly", align: "right" },
                      { label: "Monthly Score", key: "monthly", align: "right" },
                      { label: "Yearly Score", key: "yearly", align: "right" },
                    ].map((col) => (
                      <th key={col.label}
                        onClick={() => col.key && setScoreSort((s) => ({ key: col.key, dir: s.key === col.key && s.dir === "desc" ? "asc" : "desc" }))}
                        style={{
                          padding: "11px 12px", textAlign: col.align,
                          fontSize: 12, fontWeight: 800, color: t.header, position: "sticky", top: 0,
                          background: t.hover, whiteSpace: "nowrap",
                          cursor: col.key ? "pointer" : "default", userSelect: "none"
                        }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          justifyContent: col.align === "right" ? "flex-end" : "flex-start"
                        }}>
                          {col.label}
                          {col.key && (scoreSort.key === col.key
                            ? (scoreSort.dir === "desc" ? <ChevronDown size={13} /> : <ChevronUp size={13} />)
                            : <ArrowUpDown size={12} style={{ opacity: .4 }} />)}
                        </span>
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {scoreSummarySorted.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: t.sub }}>No data.</td></tr>
                    )}
                    {scoreSummarySorted.map((r, i) => (
                      <tr key={`${r.name}-${i}`} className="lk-row" style={{ borderTop: `1px solid ${t.border}` }}
                        onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "11px 12px", color: t.sub, fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: "11px 12px", fontWeight: 600 }}>{r.name}</td>
                        <td style={{ padding: "11px 12px", color: t.sub }}>{r.dept}</td>
                        <td style={{
                          padding: "11px 12px", textAlign: "right", fontWeight: 600,
                          background: r.weekly != null ? scoreBg(r.weekly) : "transparent",
                          color: r.weekly != null ? scoreColor(r.weekly) : t.sub
                        }}>{r.weekly ?? "—"}</td>
                        <td style={{
                          padding: "11px 12px", textAlign: "right", fontWeight: 600,
                          background: r.monthly != null ? scoreBg(r.monthly) : "transparent",
                          color: r.monthly != null ? scoreColor(r.monthly) : t.sub
                        }}>{r.monthly ?? "—"}</td>
                        <td style={{
                          padding: "11px 12px", textAlign: "right", fontWeight: 600,
                          background: r.yearly != null ? scoreBg(r.yearly) : "transparent",
                          color: r.yearly != null ? scoreColor(r.yearly) : t.sub
                        }}>{r.yearly ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "10px 18px", borderTop: `1px solid ${t.border}`, fontSize: 12.5, color: t.sub }}>
                Weekly = latest week · Monthly = latest month · Yearly = latest year (per employee)
              </div>
            </Panel>
          )}

          {tab === "board" && (
            <div className="lk-chart-grid" style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
              <Panel t={t} title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Trophy size={16} color={t.success} /> Top 10 Performers</span>} style={{ padding: 0 }}>
                {top10.map((r, i) => (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "11px 18px",
                    borderTop: i ? `1px solid ${t.border}` : "none"
                  }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center",
                      fontSize: 12, fontWeight: 700, color: "#fff",
                      background: i === 0 ? "#FBBC04" : i === 1 ? "#9AA0A6" : i === 2 ? "#CD7F32" : t.primary
                    }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: t.sub }}>{r.dept}</div>
                    </div>
                    <span style={{
                      padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 13,
                      background: scoreBg(r.score), color: scoreColor(r.score)
                    }}>{r.score}</span>
                  </div>
                ))}
              </Panel>
              <Panel t={t} title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><TrendingDown size={16} color={t.danger} /> Bottom 10 Performers</span>} style={{ padding: 0 }}>
                {bottom10.map((r, i) => (
                  <div key={r.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "11px 18px",
                    borderTop: i ? `1px solid ${t.border}` : "none"
                  }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center",
                      fontSize: 12, fontWeight: 700, color: "#fff", background: t.danger
                    }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: t.sub }}>{r.dept}</div>
                    </div>
                    <span style={{
                      padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 13,
                      background: scoreBg(r.score), color: scoreColor(r.score)
                    }}>{r.score}</span>
                  </div>
                ))}
              </Panel>
            </div>
          )}

          {tab === "admin" && isAdmin && (
            <>
              <Panel t={t} style={{ padding: 0 }}
                title={<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", width: "100%", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Settings size={16} color={t.primary} /> User Management · {adminUsers.length} users</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setAdminForm({ ...blankForm })} disabled={adminBusy} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "7px 14px", borderRadius: 20, border: "none", background: t.primary,
                      color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: adminBusy ? "wait" : "pointer"
                    }}>
                      <User size={14} /> Add User
                    </button>
                    <button onClick={loadUsers} disabled={adminBusy} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "7px 13px", borderRadius: 20, border: `1px solid ${t.border}`, background: t.card,
                      color: t.text, fontSize: 12.5, fontWeight: 600, cursor: adminBusy ? "wait" : "pointer"
                    }}>
                      <RotateCcw size={14} /> Refresh
                    </button>
                  </div>
                </div>}>
                {adminMsg && (
                  <div style={{
                    margin: "0 0 14px", padding: "9px 14px", borderRadius: 8, fontSize: 12.5,
                    background: `${t.primary}14`, color: t.primary
                  }}>{adminMsg}</div>
                )}
                <div className="lk-scroll" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr>
                      {["#", "Full Name", "Username", "Email", "Mobile", "Role", "Status", "Actions"].map((h) => (
                        <th key={h} style={{
                          padding: "11px 12px", textAlign: "left", fontSize: 12, fontWeight: 600,
                          color: t.sub, position: "sticky", top: 0, background: t.hover, whiteSpace: "nowrap"
                        }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {adminUsers.length === 0 && (
                        <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: t.sub }}>
                          {adminBusy ? "Loading users…" : "No users found."}</td></tr>
                      )}
                      {adminUsers.map((u, i) => {
                        const active = String(u.status).toLowerCase() === "active";
                        const self = u.username === user.username;
                        return (
                          <tr key={u.username || i} className="lk-row" style={{ borderTop: `1px solid ${t.border}` }}
                            onMouseEnter={(e) => e.currentTarget.style.background = t.hover}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                            <td style={{ padding: "10px 12px", color: t.sub }}>{i + 1}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 600 }}>{u.fullName}{self ? " (you)" : ""}</td>
                            <td style={{ padding: "10px 12px" }}>{u.username}</td>
                            <td style={{ padding: "10px 12px", color: t.sub }}>{u.email}</td>
                            <td style={{ padding: "10px 12px", color: t.sub }}>{u.mobile}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{
                                padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                                background: `${t.primary}1A`, color: t.primary
                              }}>{u.role || "Employee"}</span>
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{
                                padding: "3px 9px", borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                                background: active ? `${t.success}22` : `${t.danger}22`,
                                color: active ? t.success : t.danger
                              }}>{u.status || "Active"}</span>
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => setAdminForm({
                                  fullName: u.fullName || "", email: u.email || "",
                                  mobile: u.mobile || "", username: u.username, password: "", role: u.role || "Employee",
                                  status: u.status || "Active", _edit: true
                                })} disabled={adminBusy} title="Edit"
                                  style={{
                                    display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8,
                                    border: "none", cursor: adminBusy ? "wait" : "pointer", fontSize: 12, fontWeight: 600,
                                    background: `${t.primary}18`, color: t.primary
                                  }}>
                                  <Settings size={13} /> Edit
                                </button>
                                <button onClick={() => blockUser(u)} disabled={adminBusy || self} title={active ? "Block" : "Activate"}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8,
                                    border: "none", cursor: (adminBusy || self) ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600,
                                    opacity: self ? 0.4 : 1,
                                    background: active ? `${t.warning}22` : `${t.success}22`,
                                    color: active ? "#B06000" : t.success
                                  }}>
                                  {active ? <><Ban size={13} /> Block</> : <><Check size={13} /> Activate</>}
                                </button>
                                <button onClick={() => removeUser(u)} disabled={adminBusy || self} title="Delete"
                                  style={{
                                    display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8,
                                    border: "none", cursor: (adminBusy || self) ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600,
                                    opacity: self ? 0.4 : 1, background: `${t.danger}18`, color: t.danger
                                  }}>
                                  <Trash2 size={13} /> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "10px 18px", borderTop: `1px solid ${t.border}`, fontSize: 12.5, color: t.sub }}>
                  Blocking a user prevents login · Deleting removes them from the users collection · You can't block or delete yourself
                </div>
              </Panel>

              {adminForm && (
                <div className="lk-modal-backdrop" onClick={() => setAdminForm(null)} style={{
                  position: "fixed", inset: 0, zIndex: 80,
                  background: "rgba(0,0,0,.45)", backdropFilter: "blur(2px)", display: "grid", placeItems: "center", padding: 20
                }}>
                  <div className="lk-admin-modal" onClick={(e) => e.stopPropagation()} style={{
                    width: "100%", maxWidth: 460, background: t.card,
                    border: `1px solid ${t.border}`, borderRadius: 16, padding: 24, animation: "rise .2s both",
                    boxShadow: "0 24px 60px rgba(60,64,67,.3)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{adminForm._edit ? "Edit User" : "Add User"}</h3>
                      <button onClick={() => setAdminForm(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: t.sub }}><X size={18} /></button>
                    </div>
                    {[
                      ["fullName", "Full Name", "text"],
                      ["username", "Username", "text"],
                      ["email", "Email", "email"],
                      ["mobile", "Mobile", "text"],
                      ["password", adminForm._edit ? "New Password (leave blank to keep)" : "Password", "text"],
                    ].map(([k, label, type]) => (
                      <div key={k} style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12.5, fontWeight: 600, color: t.sub, display: "block", marginBottom: 5 }}>{label}</label>
                        <input type={type} value={adminForm[k]} disabled={k === "username" && adminForm._edit}
                          onChange={(e) => setAdminForm({ ...adminForm, [k]: e.target.value })}
                          style={{
                            width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${t.border}`,
                            background: (k === "username" && adminForm._edit) ? t.hover : t.card, color: t.text, fontSize: 14, outline: "none", boxSizing: "border-box"
                          }} />
                      </div>
                    ))}
                    <div className="lk-admin-selects" style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12.5, fontWeight: 600, color: t.sub, display: "block", marginBottom: 5 }}>Role</label>
                        <select value={adminForm.role} onChange={(e) => setAdminForm({ ...adminForm, role: e.target.value })}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: 14, outline: "none" }}>
                          <option>Employee</option><option>Manager</option><option>Admin</option>
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12.5, fontWeight: 600, color: t.sub, display: "block", marginBottom: 5 }}>Status</label>
                        <select value={adminForm.status} onChange={(e) => setAdminForm({ ...adminForm, status: e.target.value })}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: 14, outline: "none" }}>
                          <option>Active</option><option>Blocked</option>
                        </select>
                      </div>
                    </div>
                    <div className="lk-modal-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button onClick={() => setAdminForm(null)} style={{
                        padding: "10px 18px", borderRadius: 9,
                        border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: 14, fontWeight: 600, cursor: "pointer"
                      }}>Cancel</button>
                      <button onClick={saveUser} disabled={adminBusy} style={{
                        padding: "10px 22px", borderRadius: 9,
                        border: "none", background: t.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: adminBusy ? "wait" : "pointer"
                      }}>
                        {adminBusy ? "Saving…" : (adminForm._edit ? "Save Changes" : "Create User")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {/* NEW: back-to-top button */}
          {showTop && (
            <button className="lk-back-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              title="Back to top"
              style={{
                position: "fixed", bottom: 24, right: 24,
                width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer",
                background: t.primary, color: "#fff", boxShadow: "0 6px 20px rgba(26,115,232,.4)",
                display: "grid", placeItems: "center", zIndex: 40, animation: "popIn .2s both"
              }}>
              <ArrowUp size={20} />
            </button>
          )}
        </main>
      </div>
    </div>
  );
}