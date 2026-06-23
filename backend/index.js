import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

/* ----------------------------------------------------------------
   CONFIG — set these as environment variables in production.
   MONGO_URI: your Atlas connection string (with password)
----------------------------------------------------------------- */
const MONGO_URI =
  process.env.MONGO_URI ||
 "mongodb://shivam_db_user:iksRLdzPvvV68rE4@ac-w19e57c-shard-00-00.vigjb5y.mongodb.net:27017,ac-w19e57c-shard-00-01.vigjb5y.mongodb.net:27017,ac-w19e57c-shard-00-02.vigjb5y.mongodb.net:27017/?ssl=true&replicaSet=atlas-695gxp-shard-0&authSource=admin&appName=Cluster0"
 
const DB_NAME = "autoscore";
const SCORES_COL = "scoring"; // your imported sheet data
const USERS_COL = "users";   // login/admin accounts

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());                       // allow the React app to call this
app.use(express.json({ limit: "20mb" }));

const client = new MongoClient(MONGO_URI);
let db;

/* ----------------------------------------------------------------
   HELPERS
----------------------------------------------------------------- */
// Convert a raw Mongo "scores" document (your sheet column names with
// spaces/caps) into the compact object the React frontend expects.
// Frontend normalizeRow reads these exact keys:
//   date, name, dept, planned, actual, late, onTime, pending,
//   score, week, monthYear, quarter, active, year
// Turn a raw "From" value into a clean DD/MM/YYYY string. Never use the
// "Date" column (it was just a day-count 1,2,3...). Returns "" if unusable.
function cleanFromDate(doc) {
  const v = doc["From"];
  if (v == null || v === "") return "";
  // Already a JS Date (Mongo ISODate)
  if (v instanceof Date) {
    if (isNaN(v)) return "";
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${v.getFullYear()}`;
  }
  const s = String(v).trim();
  // DD/MM/YYYY or DD-MM-YYYY already good
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(s)) return s.replace(/-/g, "/");
  // ISO "2024-04-01..." -> DD/MM/YYYY
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, "0")}/${iso[2].padStart(2, "0")}/${iso[1]}`;
  return s; // leave as-is; frontend parseDate will validate
}

function toFrontendRow(doc) {
  return {
    date: cleanFromDate(doc),                          // "From" only — the REAL date (DD/MM/YYYY)
    name: doc["Person Name"] ?? "",
    dept: doc["Department"] ?? "",
    planned: doc["Total TODAY Activities (Planned)"] ?? 0,
    actual: doc["TOTAL Activities done (Actual)"] ?? 0,
    late: doc["Activities Late Done"] ?? 0,
    onTime: doc["Activities done -On time"] ?? 0,
    pending: doc["PENDING ACTIVITES"] ?? 0,
    score: doc["SCORING"] ?? 0,
    week: doc["Week"] ?? "",
    monthYear: doc["Month & Year"] ?? "",
    quarter: doc["Quarter"] ?? "",
    active: doc["ACTIVE / NOT ACTIVE"] ?? "",
    year: doc["Year"] ?? "",
  };
}

// Strip Mongo internals before sending a user object to the frontend.
function safeUser(u) {
  if (!u) return null;
  return {
    fullName: u.fullName || "",
    email: u.email || "",
    mobile: u.mobile || "",
    username: u.username || "",
    role: u.role || "Employee",
    status: u.status || "Active",
    dept: u.dept || "",
  };
}

/* ----------------------------------------------------------------
   DATA ENDPOINT — feeds the whole dashboard
----------------------------------------------------------------- */
app.post("/getData", async (req, res) => {
  try {
    const docs = await db.collection(SCORES_COL).find({}).toArray();
    const rows = docs.map(toFrontendRow);
    res.json({ ok: true, rows });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/* ----------------------------------------------------------------
   AUTH ENDPOINTS
   NOTE: passwords here are stored/compared as PLAIN TEXT to match the
   simple Google Sheet setup. For real production, hash with bcrypt.
----------------------------------------------------------------- */
app.post("/loginUser", async (req, res) => {
  try {
    const { loginId, password } = req.body;
    const id = String(loginId || "").trim();
    const user = await db.collection(USERS_COL).findOne({
      $or: [{ username: id }, { email: id }],
    });
    if (!user) return res.json({ ok: false, error: "User not found." });
    if (String(user.status).toLowerCase() === "blocked")
      return res.json({ ok: false, error: "Account is blocked." });
    if (String(user.password) !== String(password))
      return res.json({ ok: false, error: "Invalid credentials." });

    await db.collection(USERS_COL).updateOne(
      { username: user.username },
      { $set: { lastLogin: new Date().toISOString() } }
    );
    res.json({ ok: true, user: safeUser(user) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post("/registerUser", async (req, res) => {
  try {
    const { fullName, email, mobile, username, password } = req.body;
    const exists = await db.collection(USERS_COL).findOne({
      $or: [{ username }, { email }],
    });
    if (exists) return res.json({ ok: false, error: "Username or email already taken." });

    await db.collection(USERS_COL).insertOne({
      fullName, email, mobile, username, password,
      role: "Employee", status: "Active",
      createdDate: new Date().toISOString(), lastLogin: "",
    });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/* ----------------------------------------------------------------
   ADMIN — user management
----------------------------------------------------------------- */
app.post("/listUsers", async (req, res) => {
  try {
    const users = await db.collection(USERS_COL).find({}).toArray();
    res.json({ ok: true, users: users.map(safeUser) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post("/createUser", async (req, res) => {
  try {
    const { fullName, email, mobile, username, password, role, status } = req.body;
    const exists = await db.collection(USERS_COL).findOne({ username });
    if (exists) return res.json({ ok: false, error: "Username already exists." });
    await db.collection(USERS_COL).insertOne({
      fullName, email, mobile, username,
      password: password || "changeme",
      role: role || "Employee", status: status || "Active",
      createdDate: new Date().toISOString(), lastLogin: "",
    });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post("/updateUser", async (req, res) => {
  try {
    const { fullName, email, mobile, username, password, role, status } = req.body;
    const set = { fullName, email, mobile, role, status };
    if (password) set.password = password; // only overwrite if provided
    const r = await db.collection(USERS_COL).updateOne({ username }, { $set: set });
    if (!r.matchedCount) return res.json({ ok: false, error: "User not found." });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post("/setUserStatus", async (req, res) => {
  try {
    const { username, status } = req.body;
    const r = await db.collection(USERS_COL).updateOne({ username }, { $set: { status } });
    if (!r.matchedCount) return res.json({ ok: false, error: "User not found." });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post("/deleteUser", async (req, res) => {
  try {
    const { username } = req.body;
    const r = await db.collection(USERS_COL).deleteOne({ username });
    if (!r.deletedCount) return res.json({ ok: false, error: "User not found." });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/* ----------------------------------------------------------------
   HEALTH CHECK + STARTUP
----------------------------------------------------------------- */
app.get("/", (req, res) => res.send("Scoring backend is running."));

async function seedAdmin() {
  // Create a default admin the first time so you can log in.
  const count = await db.collection(USERS_COL).countDocuments();
  if (count === 0) {
    await db.collection(USERS_COL).insertOne({
      fullName: "Administrator", email: "admin@company.com", mobile: "0000000000",
      username: "admin", password: "admin123", role: "Admin", status: "Active",
      createdDate: new Date().toISOString(), lastLogin: "",
    });
    console.log("Seeded default admin → username: admin / password: admin123");
  }
}

client.connect().then(async () => {
  db = client.db(DB_NAME);
  await seedAdmin();
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}).catch((e) => {
  console.error("Mongo connection failed:", e.message);
});