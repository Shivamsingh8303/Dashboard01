import crypto from "crypto";

/* ----------------------------------------------------------------
   Employee assessment storage (MongoDB)
   Receives assessments from the Google Apps Script form and saves them
   in their own collection, separate from the "scoring" data.

   Env vars (backend .env / Render):
     FORM_API_KEY     required - same secret you put in Apps Script (setupMongoSync)
     ASSESS_DB_NAME   optional - use a separate database. Default = same DB as the server.
     ASSESS_COLLECTION optional - default "assessments"
     EMP_DB_NAME      optional - database that holds your employee/scoring data (default = server DB)
     EMP_COLLECTION   optional - collection with "Person Name" + "Department" (default = server SCORES_COL)
                      (the same collection is used for the employee list AND the date-range score)
----------------------------------------------------------------- */
const CRITERIA = [
  "Technical Skill", "Workflow Knowledge", "Follow-up & Updates", "On-Time Reports",
  "Accountability", "Communication Skills", "Problem Solving",
  "Teamwork & Coordination", "Learning & Adaptability", "Discipline & Professionalism",
];
const LIMITS = { str: 500, imp: 500, overall: 1000, add: 500 };

function keyOk(req) {
  const expected = process.env.FORM_API_KEY || "";
  const got = String(req.headers["x-api-key"] || "");
  if (!expected || expected.length !== got.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

const txt = (v, max) => String(v ?? "").trim().slice(0, max);

/* ---------- date helpers (same rules as the dashboard's cleanDate/parseDate) ---------- */
const MIN_YEAR = 2000;
function utcDay(y, m, d) {            // m = 1..12 ; returns ms (UTC midnight) or null if not a real date
  const t = Date.UTC(y, m - 1, d);
  const x = new Date(t);
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? t : null;
}
// Value stored in the "From" column -> UTC-midnight ms, or null when unusable
function rowDay(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : utcDay(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const s = String(v).trim();
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return +m[3] >= MIN_YEAR ? utcDay(+m[3], +m[2], +m[1]) : null;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return +m[1] >= MIN_YEAR ? utcDay(+m[1], +m[2], +m[3]) : null;
  return null;
}
// "DD/MM/YYYY" from the form -> ms ; "" -> null (open ended) ; bad -> undefined
function inputDay(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return undefined;
  const t = utcDay(+m[3], +m[2], +m[1]);
  return t == null ? undefined : t;
}
const dmy = (t) => {
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};
const r2 = (n) => Math.round(n * 100) / 100;
// Score snapshot sent along with an assessment (Apps Script fetched it from /employeeScore) - sanitised, never trusted blindly
function cleanScore(sc) {
  if (!sc || typeof sc !== "object") return null;
  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? r2(x) : 0; };
  const d = (v) => (/^\d{2}\/\d{2}\/\d{4}$/.test(String(v || "")) ? String(v) : "");
  return {
    from: d(sc.from), to: d(sc.to),
    planned: n(sc.planned), actual: n(sc.actual), onTime: n(sc.onTime),
    late: n(sc.late), pending: n(sc.pending),
    score: n(sc.score), completion: n(sc.completion),
    days: Math.max(0, Math.trunc(Number(sc.days)) || 0),
    savedAt: new Date(),
  };
}
// Looker Studio / dashboard formula
const calcScore = (planned, onTime, late) =>
  planned ? Math.round(((onTime + late * 0.5) / planned - 1) * 10000) / 100 : 0;
const num = (field) => ({ $convert: { input: field, to: "double", onError: 0, onNull: 0 } });
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function validate(b) {
  if (!b || typeof b !== "object") return { error: "Invalid body." };
  const candidate = txt(b.cand, 120), dept = txt(b.dept, 120);
  if (!candidate) return { error: "Employee is required." };
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(b.date || ""));
  if (!m) return { error: "Invalid date." };
  const dt = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (dt.getUTCDate() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1) return { error: "Invalid date." };
  if (!Array.isArray(b.r) || b.r.length !== CRITERIA.length ||
      b.r.some((x) => !(Number.isInteger(x) && x >= 1 && x <= 5)))
    return { error: "Ratings must be 10 whole numbers from 1 to 5." };
  const str = txt(b.str, LIMITS.str), imp = txt(b.imp, LIMITS.imp), overall = txt(b.overall, LIMITS.overall);
  if (!str || !imp || !overall) return { error: "Required remarks missing." };

  const total = b.r.reduce((a, c) => a + c, 0);
  const ratings = {};
  CRITERIA.forEach((c, i) => (ratings[c] = b.r[i]));
  return {
    doc: {
      candidate, department: dept,
      date: b.date, dateISO: dt,
      ratings, totalScore: total, maxScore: CRITERIA.length * 5,
      averageScore: Math.round((total / CRITERIA.length) * 100) / 100,
      performancePct: Math.round((total / (CRITERIA.length * 5)) * 1000) / 10,
      strengths: str, improvements: imp, overallRemarks: overall,
      additionalComments: txt(b.add, LIMITS.add),
      scoring: cleanScore(b.sc),   // dashboard score for the chosen date range (null if it could not be fetched)
      source: "assessment-form",
      updatedAt: new Date(),
    },
  };
}

export function registerAssessmentRoutes(app, client, defaultDbName, scoresCol = "scoring") {
  const dbName = process.env.ASSESS_DB_NAME || defaultDbName;
  const colName = process.env.ASSESS_COLLECTION || "assessments";
  const col = () => client.db(dbName).collection(colName);

  let indexReady = null;
  const ensureIndex = () =>
    (indexReady ||= col()
      .createIndex({ dateISO: 1, candidate: 1 }, { unique: true })
      .catch((e) => { indexReady = null; throw e; }));

  // One assessment per candidate per date; saving again for the same date updates it.
  app.post("/saveAssessment", async (req, res) => {
    if (!process.env.FORM_API_KEY) return res.status(503).json({ ok: false, error: "FORM_API_KEY not set on server." });
    if (!keyOk(req)) return res.status(401).json({ ok: false, error: "Unauthorized." });
    try {
      const v = validate(req.body);
      if (v.error) return res.status(400).json({ ok: false, error: v.error });
      await ensureIndex();
      const r = await col().updateOne(
        { dateISO: v.doc.dateISO, candidate: v.doc.candidate },
        { $set: v.doc, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
      res.json({ ok: true, created: !!r.upsertedCount });
    } catch (e) {
      console.error("saveAssessment:", e.message);
      res.status(500).json({ ok: false, error: "Save failed." });
    }
  });

  // Employee list (Person Name + Department) for the Apps Script form dropdown.
  // Uses the same "not inactive" rule as /getData. Cached for 10 minutes.
  const empDb = process.env.EMP_DB_NAME || defaultDbName;
  const empCol = process.env.EMP_COLLECTION || scoresCol;
  let empCache = { at: 0, data: null };
  app.post("/employeesList", async (req, res) => {
    if (!process.env.FORM_API_KEY) return res.status(503).json({ ok: false, error: "FORM_API_KEY not set on server." });
    if (!keyOk(req)) return res.status(401).json({ ok: false, error: "Unauthorized." });
    try {
      if (!req.body?.fresh && empCache.data && Date.now() - empCache.at < 10 * 60 * 1000)
        return res.json({ ok: true, employees: empCache.data });
      const rows = await client.db(empDb).collection(empCol).aggregate([
        { $match: { "ACTIVE / NOT ACTIVE": { $not: /not|inactive/i }, "Person Name": { $type: "string", $ne: "" } } },
        { $group: { _id: { n: "$Person Name", d: "$Department" }, c: { $sum: 1 } } },
        { $sort: { c: -1 } },
        { $group: { _id: "$_id.n", dept: { $first: "$_id.d" } } },
        { $sort: { _id: 1 } },
      ], { allowDiskUse: true }).toArray();
      const employees = rows
        .map((r) => ({ name: String(r._id).trim(), dept: String(r.dept ?? "").trim() }))
        .filter((e) => e.name);
      empCache = { at: Date.now(), data: employees };
      res.json({ ok: true, employees });
    } catch (e) {
      console.error("employeesList:", e.message);
      res.status(500).json({ ok: false, error: "Could not load employees." });
    }
  });


  // Scoring of ONE employee between two dates - same data + same formula as the dashboard.
  //   body: { name, from: "DD/MM/YYYY" | "", to: "DD/MM/YYYY" | "" }   (blank = no limit)
  let nameIdx = null;
  app.post("/employeeScore", async (req, res) => {
    if (!process.env.FORM_API_KEY) return res.status(503).json({ ok: false, error: "FORM_API_KEY not set on server." });
    if (!keyOk(req)) return res.status(401).json({ ok: false, error: "Unauthorized." });
    try {
      const name = txt(req.body?.name, 120);
      if (!name) return res.status(400).json({ ok: false, error: "Employee is required." });
      const from = inputDay(req.body?.from), to = inputDay(req.body?.to);
      if (from === undefined || to === undefined) return res.status(400).json({ ok: false, error: "Invalid date." });
      if (from != null && to != null && from > to)
        return res.status(400).json({ ok: false, error: "From date cannot be after To date." });

      const coll = client.db(empDb).collection(empCol);
      // best effort: makes the per-employee lookup fast (runs once, never blocks / fails the request)
      nameIdx ||= coll.createIndex({ "Person Name": 1 }).catch(() => {});

      const fetchRows = (nameFilter) => coll.aggregate([
        { $match: { "Person Name": nameFilter, "ACTIVE / NOT ACTIVE": { $not: /not|inactive/i } } },
        { $project: {
            _id: 0, date: "$From",
            planned: num("$Total TODAY Activities (Planned)"),
            actual: num("$TOTAL Activities done (Actual)"),
            late: num("$Activities Late Done"),
            onTime: num("$Activities done -On time"),
            pending: num("$PENDING ACTIVITES"),
        } },
      ], { allowDiskUse: true }).toArray();

      let rows = await fetchRows(name);
      if (!rows.length) rows = await fetchRows(new RegExp("^\\s*" + escRe(name) + "\\s*$")); // stray spaces in the sheet data

      const sum = { planned: 0, actual: 0, late: 0, onTime: 0, pending: 0 };
      let days = 0, first = null, last = null;
      for (const r of rows) {
        const t = rowDay(r.date);
        if ((from != null || to != null) && t == null) continue;     // dashboard drops undated rows when a date filter is on
        if (from != null && t < from) continue;
        if (to != null && t > to) continue;
        days++;
        if (t != null) { first = first == null ? t : Math.min(first, t); last = last == null ? t : Math.max(last, t); }
        for (const k of Object.keys(sum)) sum[k] += Number(r[k]) || 0;
      }
      res.json({
        ok: true, name,
        from: from != null ? dmy(from) : "", to: to != null ? dmy(to) : "",
        firstDate: first != null ? dmy(first) : "", lastDate: last != null ? dmy(last) : "",
        days,
        planned: r2(sum.planned), actual: r2(sum.actual), onTime: r2(sum.onTime),
        late: r2(sum.late), pending: r2(sum.pending),
        score: calcScore(sum.planned, sum.onTime, sum.late),
        completion: sum.planned ? r2((sum.actual / sum.planned) * 100) : 0,
      });
    } catch (e) {
      console.error("employeeScore:", e.message);
      res.status(500).json({ ok: false, error: "Could not load score." });
    }
  });

  console.log(`Employee source: ${empDb}.${empCol}`);
  console.log(`Assessment storage: ${dbName}.${colName}`);
}