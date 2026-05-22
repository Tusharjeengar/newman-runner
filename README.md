# Newman Runner

**A free, open-source desktop app for running Postman collections with AI-powered insights, data-driven testing, and automated scheduling.**

Built by **Tushar Jeengar**

---

## 🚀 Download & Install

### Windows Installer
👉 **[Download Newman Runner Setup (Windows)](https://github.com/TusharJeengar/newman-runner/releases/latest)**

1. Go to the **Releases** page
2. Download `Newman.Runner.Setup.1.0.0.exe`
3. Run the installer
4. Launch "Newman Runner" from your desktop or Start Menu

> No Node.js, no terminal, no setup required. Just install and use.

---

## ✨ Features

### 🎯 Core — Run Postman Collections
- Upload and run any Postman collection (`.json`)
- Select specific folders or individual requests to run
- Set target environment variables (Dev, Preprod, Sprint, etc.)
- Inject custom variables, headers, and query params at runtime
- View real-time execution logs
- Auto-generated HTML + JSON reports

### 📊 Data-Driven Testing (FREE — no Postman paid plan needed)
- Upload CSV or JSON data files
- Newman runs once per row — substituting `{{variables}}` automatically
- Preview data file before running (columns, rows, sample data)
- Works exactly like Postman's paid Collection Runner — but free

### 🧠 AI/ML Insights
- **Health Score** — Weighted 0-100 score based on pass rate, flakiness, anomalies
- **Flaky Test Detection** — Identifies tests that flip between pass/fail across runs
- **Response Time Anomaly Detection** — Z-score analysis flags abnormally slow endpoints
- **Performance Degradation Tracking** — Detects endpoints getting slower over time
- **Failure Pattern Classification** — Groups failures by root cause (auth, server, timeout, data)
- **Correlated Failure Detection** — Finds requests that fail together (shared dependency)
- **Slowest Endpoints** — Ranks APIs by response time (avg, P95, max)
- **Most Failing Requests** — Shows highest failure rate endpoints
- **Error Rate Spike Detection** — Alerts when error rates suddenly increase
- **Smart Recommendations** — AI-generated action items based on detected patterns

### 🤖 Assert Generator
- Paste any JSON response body
- AI engine generates ready-to-use Postman test scripts
- Detects patterns: email, UUID, ISO dates, URLs, JWT, currency codes
- Generates: type checks, schema validation, value assertions, security checks
- One-click copy — paste directly into Postman Tests tab

### ⏰ Scheduler
- Schedule collection runs: once, daily, hourly, or every 30 minutes
- Select multiple folders to run at scheduled time
- Live countdown timer
- Auto-generates reports with job name

### 📋 Reports
- HTML reports (visual, shareable)
- JSON reports (for analysis)
- Download individual or all as ZIP
- Delete individual or all reports

---

## 📸 How It Works

### Run Collection
1. Select a collection from the dropdown
2. Optionally pick a folder or specific request
3. Set your target environment
4. (Optional) Upload a CSV/JSON data file for data-driven testing
5. Click **Run Now**
6. View results in Logs, History, or Reports tabs

### Data-Driven Testing
1. Create a CSV file with your test data:
```csv
username,password,expected_status
john,pass123,200
jane,wrong,401
admin,admin123,200
```
2. In your Postman collection, use `{{username}}`, `{{password}}` as variables
3. Upload the CSV in the Run tab
4. Newman runs once per row automatically

### AI Insights
1. Run several test collections (more data = better analysis)
2. Click the **🧠 Insights** tab
3. Click **Analyze Reports**
4. View health score, flaky tests, anomalies, and recommendations

### Assert Generator
1. Click the **🤖 Assert Generator** tab
2. Paste a JSON response body from any API
3. Select depth (shallow/deep) and style (strict/balanced/flexible)
4. Click **Generate Assertions**
5. Click **Copy All** — paste into Postman Tests tab

---

## 🛠️ Tech Stack

- **Frontend:** HTML, CSS, JavaScript (single-page app)
- **Backend:** Node.js, Express
- **Test Runner:** Newman (open-source Postman CLI)
- **Reports:** newman-reporter-htmlextra
- **Desktop:** Electron
- **AI/ML:** Custom rule-based engines (no external API keys needed)

---

## 💻 Run from Source (for developers)

```bash
git clone https://github.com/TusharJeengar/newman-runner.git
cd newman-runner
npm install
node server.js
```
Open http://localhost:4500 in your browser.

### Build Desktop App
```bash
npm run build
```
Installer will be in the `dist/` folder.

---

## 📁 Project Structure

```
newman-runner/
├── main.js                  # Electron main process
├── server.js                # Express server + all APIs
├── run-newman.js            # Newman child process runner
├── insights-engine.js       # AI/ML analysis engine
├── assertion-generator.js   # Smart assertion generator
├── public/
│   └── index.html           # Single-page frontend
├── collections/             # Uploaded Postman collections
├── environments/            # Uploaded environment files
├── datafiles/               # CSV/JSON data files for data-driven testing
├── reports/                 # Generated HTML + JSON reports
└── package.json
```

---

## 🆓 Why This Exists

Postman moved many features to paid plans:
- ❌ Data-driven testing (CSV/JSON) — now paid
- ❌ Unlimited collection runs — now limited
- ❌ Scheduled runs — now paid
- ❌ Advanced reporting — now paid

**Newman Runner gives you all of these for free**, plus AI-powered insights that Postman doesn't offer at any price.

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

## 👤 Author

**Tushar Jeengar**

---

## ⭐ Star This Repo

If this tool saves you time or money, give it a ⭐ on GitHub!
