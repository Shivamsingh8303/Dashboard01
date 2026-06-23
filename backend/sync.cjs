const { google } = require("googleapis");
const { MongoClient } = require("mongodb");

const SHEET_ID = "1OUGIjQle3Gx1cQcRJZ4a6UpsxfRK0xUGJoT889LSpOM";
const MONGO_URI = "mongodb://shivam_db_user:iksRLdzPvvV68rE4@ac-w19e57c-shard-00-00.vigjb5y.mongodb.net:27017,ac-w19e57c-shard-00-01.vigjb5y.mongodb.net:27017,ac-w19e57c-shard-00-02.vigjb5y.mongodb.net:27017/?ssl=true&replicaSet=atlas-695gxp-shard-0&authSource=admin&appName=Cluster0";

async function main() {
  // Connect to Google Sheets
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // Read the DATA sheet
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "DATA!A1:Q",
  });
  const rows = res.data.values;
  const headers = rows[0];

  // Turn rows into documents
  const docs = rows.slice(1)
    .filter(r => r[1])  // must have Person Name
    .map(r => {
      const doc = {};
      headers.forEach((h, i) => { doc[h] = r[i] || null; });
      return doc;
    });

  // Connect to MongoDB
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const col = client.db("autoscore").collection("scoring");

  // Clear old data, then insert fresh (prevents duplicates)
  await col.deleteMany({});

  const BATCH = 1000;
  for (let i = 0; i < docs.length; i += BATCH) {
    await col.insertMany(docs.slice(i, i + BATCH));
    console.log(`Inserted ${Math.min(i + BATCH, docs.length)} / ${docs.length}`);
  }

  await client.close();
  console.log("Done!");
}

main().catch(console.error);
