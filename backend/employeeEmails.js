// Backend routes for the Employee Emails page.
// Uses the SAME native MongoDB connection your index.js already has (no mongoose).
//
// In index.js:
//     import registerEmployeeEmailRoutes from "./employeeEmails.js";
//     registerEmployeeEmailRoutes(app, () => db);   // db = your connected Db, e.g. client.db("autoscore")

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLLECTION = "employeecontacts";

export default function registerEmployeeEmailRoutes(app, getDb) {
  let indexReady = false;

  const col = async () => {
    const db = typeof getDb === "function" ? getDb() : getDb;
    if (!db) throw new Error("Database is not connected yet");
    const c = db.collection(COLLECTION);
    if (!indexReady) {
      await c.createIndex({ name: 1 }, { unique: true });
      indexReady = true;
    }
    return c;
  };

  // Returns every saved name + email
  app.post("/getEmployeeEmails", async (req, res) => {
    try {
      const c = await col();
      const list = await c
        .find({}, { projection: { _id: 0, name: 1, dept: 1, email: 1 } })
        .toArray();
      res.json({ ok: true, list });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });

  // Saves one or many: body = { items: [{ name, dept, email }] }
  app.post("/saveEmployeeEmails", async (req, res) => {
    try {
      const items = Array.isArray(req.body.items) ? req.body.items : [];
      const ops = [];
      for (const it of items) {
        const name = String(it.name || "").trim();
        const email = String(it.email || "").trim().toLowerCase();
        if (!name) continue;
        if (email && !EMAIL_RE.test(email)) {
          return res.json({ ok: false, error: `Invalid email for ${name}` });
        }
        ops.push({
          updateOne: {
            filter: { name },
            update: {
              $set: { dept: String(it.dept || ""), email, updatedAt: new Date() },
              $setOnInsert: { createdAt: new Date() },
            },
            upsert: true,
          },
        });
      }
      if (ops.length) {
        const c = await col();
        await c.bulkWrite(ops);
      }
      res.json({ ok: true, saved: ops.length });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });
}