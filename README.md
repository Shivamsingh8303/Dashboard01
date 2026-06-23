# Scoring Dashboard — Full Project

Two parts that run together:
- backend/    → Node.js + Express server that reads your data from MongoDB Atlas
- dashboard/  → React (Vite) dashboard UI

```
project/
├── backend/
│   ├── index.js          <- the server
│   ├── package.json
│   ├── .gitignore
│   └── README.md
└── dashboard/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    ├── .env              <- points to the backend
    └── src/
        ├── App.jsx       <- your dashboard
        └── main.jsx
```

=====================================================================
STEP 1 — START THE BACKEND
=====================================================================
1. Open a terminal in the backend folder:
       cd backend

2. Open index.js and set your MongoDB connection string.
   Find MONGO_URI near the top and replace USERNAME:PASSWORD with your
   real Atlas database user + password (the ones that worked in Compass).

   OR set it as an environment variable instead of editing the file:
       Windows PowerShell:
         $env:MONGO_URI="mongodb+srv://USER:PASS@cluster0.vigjb5y.mongodb.net/?retryWrites=true&w=majority"
       Mac/Linux:
         export MONGO_URI="mongodb+srv://USER:PASS@cluster0.vigjb5y.mongodb.net/?retryWrites=true&w=majority"

3. Install and run:
       npm install
       npm start

   You should see: "Backend running on port 3000"
   On first run it creates a default login:
       username: admin
       password: admin123

   Leave this terminal open.

=====================================================================
STEP 2 — START THE DASHBOARD
=====================================================================
1. Open a SECOND terminal in the dashboard folder:
       cd dashboard

2. The .env file already says:
       VITE_API_URL=http://localhost:3000
   (Leave it as-is for local use.)

3. Install and run:
       npm install
       npm run dev

4. Open the URL it prints (usually http://localhost:5173).

5. Log in with:
       username: admin
       password: admin123

=====================================================================
IMPORTANT — IF TABLES ARE EMPTY AFTER LOGIN
=====================================================================
Your data lives in MongoDB with the original sheet column names
("Person Name", "SCORING", "PENDING ACTIVITES", etc.). The backend's
toFrontendRow() function (in backend/index.js) maps those names to what
the dashboard expects. If a column name doesn't match, that field shows
empty. Open one document in Compass, compare the exact key names, and
adjust toFrontendRow() to match.

=====================================================================
NOTES
=====================================================================
- Passwords are stored as plain text to mirror the original sheet setup.
  For production, hash them with bcrypt.
- The "scores" collection holds your imported sheet data.
- The "users" collection holds login accounts (admin is auto-created).
- The dashboard auto-refreshes data every 5 minutes.
