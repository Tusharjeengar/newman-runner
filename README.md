# Newman Runner

A desktop application to run Postman collections locally via Newman, view real-time logs, generate HTML & JSON reports, schedule automated runs, and download reports as ZIP for sharing.

## Features

- **Run Collections** — Select a Postman collection, pick specific folders or run all, set target environment
- **Tree View** — Browse collection folder/request structure with search and expand/collapse
- **Target Environment** — Override the environment variable in collection pre-scripts at runtime
- **Custom Variables** — Pass additional key-value variables at runtime
- **HTML & JSON Reports** — Auto-generated after every run using newman-reporter-htmlextra
- **ZIP Download** — Download individual or all reports as ZIP for email sharing
- **Real-time Logs** — View live execution logs (requests, responses, assertions)
- **Run History** — Track all past runs with pass/fail status, duration, and report links
- **Scheduler** — Automate runs at specific times (once, daily, hourly, every 30 min)
- **Multi-folder Scheduling** — Select multiple folders to run sequentially on schedule
- **Notifications** — Toast notifications with sound when a run completes
- **Persistent Storage** — Uploaded collections are remembered across sessions
- **Desktop App** — Packaged as a standalone Windows .exe (no Node.js required for end users)

## Technology Stack

| Technology | Purpose |
|---|---|
| **Node.js** | Backend runtime |
| **Express.js** | HTTP server and API |
| **Newman** | Postman collection runner (CLI) |
| **newman-reporter-htmlextra** | HTML report generation |
| **newman-reporter-json** | JSON report generation |
| **Multer** | File upload handling |
| **Archiver** | ZIP file creation |
| **Electron** | Desktop app packaging |
| **electron-builder** | Windows installer (.exe) creation |
| **HTML/CSS/JavaScript** | Frontend UI (single-page app) |

## How to Run (Development)

### Prerequisites

- Node.js v18+ installed
- npm

### Steps

```bash
# 1. Clone or extract the project
cd newman-runner

# 2. Install dependencies
npm install

# 3. Start the server (browser mode)
npm start

# 4. Open in browser
# http://localhost:4500
```

### Run as Desktop App (Electron)

```bash
npm run electron
```

### Build Windows Installer (.exe)

```bash
npm run build
```

The installer will be created at `dist/Newman Runner Setup 1.0.0.exe`.

## How to Use

1. **Upload** a Postman collection JSON via the Upload tab
2. Go to **Run Collection** tab
3. Select your collection — the folder tree loads automatically
4. (Optional) Click a folder to run only that part
5. (Optional) Enter target environment name (as defined in your collection pre-script)
6. Click **Run Now**
7. Check **Logs** for real-time output, **History** for results, **Reports** for HTML/JSON files

## Scheduler

1. Go to **Scheduler** tab
2. Select a collection and check the folders you want to automate
3. Set schedule type (Once / Daily / Hourly / Every 30 Min) and date/time
4. Click **Schedule Job**
5. The job runs automatically at the scheduled time (app must be running)

## Project Structure

```
newman-runner/
├── main.js              # Electron entry point
├── server.js            # Express server + Newman runner + Scheduler
├── package.json         # Dependencies and build config
├── public/
│   └── index.html       # Frontend UI (single file)
├── collections/         # Uploaded Postman collections
├── environments/        # Uploaded environment files
├── reports/             # Generated HTML & JSON reports
└── dist/                # Built installer output
```

## Sharing with Team

- Share the `Newman Runner Setup 1.0.0.exe` file
- No collections or data is included — each user gets a clean app
- Each user uploads their own collections and generates their own reports
- Data is stored locally in each user's AppData folder

---

**Published by TJ**
