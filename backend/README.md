# Scoring Dashboard — Node.js + MongoDB Backend

This backend replaces the old Google Apps Script. It serves your React
dashboard with data from MongoDB Atlas.

## 1. Install
```bash
npm install
```

## 2. Set your MongoDB connection string
Either edit MONGO_URI at the top of index.js, OR set an environment variable:

```bash
# Windows (PowerShell)
$env:MONGO_URI="mongodb+srv://USER:PASS@cluster0.vigjb5y.mongodb.net/?retryWrites=true&w=majority"

# Mac/Linux
export MONGO_URI="mongodb+srv://USER:PASS@cluster0.vigjb5y.mongodb.net/?retryWrites=true&w=majority"
```

Replace USER and PASS with your Atlas database user + password.

## 3. Run
```bash
npm start
```
You should see: "Backend running on port 3000"
On first run it creates a default admin:
  username: admin
  password: admin123

## 4. Point the React app at this backend
In your React project, create a file `.env` with:
```
VITE_API_URL=http://localhost:3000
```
Then restart your React dev server.

## Endpoints (all POST, JSON)
- /getData        -> { ok, rows: [...] }   (feeds the whole dashboard)
- /loginUser      -> { ok, user }
- /registerUser   -> { ok }
- /listUsers      -> { ok, users }
- /createUser     -> { ok }
- /updateUser     -> { ok }
- /setUserStatus  -> { ok }
- /deleteUser     -> { ok }

## IMPORTANT — field mapping
Your imported `scores` collection uses the sheet's original column names
(e.g. "Person Name", "SCORING"). The toFrontendRow() function in index.js
maps those to what the React app expects. If your column names differ,
edit toFrontendRow() to match.

## Note on the "Date" column
In your import, the "Date" field came in as a day number (1, 2, 3...),
while "From" / "To" held the real dates ("01/04/2024"). The mapper falls
back to "From" for the real date. Adjust if needed.

## Security note
Passwords are stored as plain text to mirror the original sheet setup.
For production, hash them with bcrypt.
