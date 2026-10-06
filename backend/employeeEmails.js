import mongoose from "mongoose";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const employeeContactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    dept: { type: String, default: "" },
    email: { type: String, default: "", trim: true, lowercase: true },
  },
  { timestamps: true }
);

export const EmployeeContact =
  mongoose.models.EmployeeContact || mongoose.model("EmployeeContact", employeeContactSchema);

export default function registerEmployeeEmailRoutes(app) {
  // Returns every saved name + email
  app.post("/getEmployeeEmails", async (req, res) => {
    try {
      const list = await EmployeeContact.find({}, { _id: 0, name: 1, dept: 1, email: 1 }).lean();
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
            update: { $set: { dept: String(it.dept || ""), email } },
            upsert: true,
          },
        });
      }
      if (ops.length) await EmployeeContact.bulkWrite(ops);
      res.json({ ok: true, saved: ops.length });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });
}