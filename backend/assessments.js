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

function validate(b) {
  if (!b || typeof b !== "object") return { error: "Invalid body." };
  const candidate = txt(b.cand, 120), hod = txt(b.hod, 120), dept = txt(b.dept, 120);
  if (!candidate) return { error: "Candidate is required." };
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
      candidate, hod, department: dept,
      date: b.date, dateISO: dt,
      ratings, totalScore: total, maxScore: CRITERIA.length * 5,
      averageScore: Math.round((total / CRITERIA.length) * 100) / 100,
      performancePct: Math.round((total / (CRITERIA.length * 5)) * 1000) / 10,
      strengths: str, improvements: imp, overallRemarks: overall,
      additionalComments: txt(b.add, LIMITS.add),
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

  console.log(`Employee source: ${empDb}.${empCol}`);
  console.log(`Assessment storage: ${dbName}.${colName}`);
}