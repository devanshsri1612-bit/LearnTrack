# LearnTrack — Student Learning & Academic Advising Platform

LearnTrack is a comprehensive student success, performance analytics, academic document processing, and advising management platform.

---

## Architecture Overview

```
LearnTrack
├── apps/
│   ├── api/             # Node.js/Express TypeScript backend (Port 4000)
│   │   ├── prisma/      # SQLite database schema (dev.db) & seeds
│   │   ├── src/         # API routes, auth, RBAC, meetings & Google integration
│   │   └── test/        # Vitest backend integration test suite (25 tests)
│   └── web/             # React + Vite TypeScript frontend (Port 5173/5174)
│       ├── src/         # UI pages, Meeting Scheduler, OCR, and dashboard
│       └── test/        # Vitest end-to-end component tests (10 tests)
├── packages/
│   └── contracts/       # Shared Zod schemas, TypeScript types, and contracts
└── ml-delivery (3)/ml-delivery (2)/ml-delivery/
    ├── app/             # FastAPI ML service + BHASHINI OCR (Port 8000)
    └── tests/           # Pytest suite for ML prediction & OCR (23 tests)
```

---

## Features

1. **Academic Support & Case Management:**
   - Role-Based Access Control (RBAC) across Mentor, Faculty, Counsellor, Finance, HOD, and Student.
   - Student 360 profiling with consent-governed data protection (restricted notes never exposed inappropriately).
   - Early warning risk assessments with explainable indicators.

2. **Real Google Calendar Integration:**
   - Synchronizes advising meetings directly with Google Calendar via the Google Calendar API (`/v3/calendars/primary/events`).
   - Supports `Asia/Kolkata` timezone by default or custom student timezones.
   - Privacy-safe event titles ("Academic Support Check-in") and descriptions that never expose internal case refs, student marks, or confidential notes.
   - Generates Google Meet links (`hangoutsMeet`) when conference data is supported.
   - Tracks Google Event ID, sync status (`SYNCED`, `PENDING`, `FAILED`), and error details with retry support.

3. **Gmail Meeting Notifications:**
   - Sends formatted advising appointment notifications via the Gmail API (`/gmail/v1/users/me/messages/send`).
   - Uses verified recipient addresses from student records—never invents addresses.
   - Includes appointment title, formatted date/time, timezone, organiser, and rescheduling/cancellation instructions.
   - Independent status tracking (`SENT`, `PENDING`, `FAILED`, `UNAVAILABLE`) preserving partial success when Calendar succeeds and email fails.
   - Idempotent and duplicate-safe: retries do not send duplicate emails.

4. **BHASHINI OCR Integration & Document Parsing:**
   - Government of India BHASHINI Dhruva pipeline integration (`bhashini/bodhan/indic-doc/ocr`).
   - Dynamic document parsing for student marks, roll numbers, exams, and attendance.
   - Tamper-proof SHA-256 canonical cryptographic document hashing.

---

## Environment & Configuration

### API Backend (`apps/api/.env`)
Copy from `apps/api/.env.example`:
```env
NODE_ENV=development
PORT=4000
DATABASE_URL="file:./dev.db"
SESSION_SECRET="replace-with-a-long-random-session-secret-in-production"
SESSION_EXPIRY_HOURS=24
DEMO_PASSWORD="demo-password"
ML_MODE="MOCK"
ML_SERVICE_URL="http://127.0.0.1:8000"
ML_TIMEOUT_MS=4000

# Google Calendar & Gmail Integration
GOOGLE_INTEGRATION_MODE="MOCK" # Set to "LIVE" for real Google Cloud APIs
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:4000/api/integrations/google/callback"
GOOGLE_REFRESH_TOKEN=""
GOOGLE_SENDER_EMAIL="advising@learntrack.edu"
```

### ML & OCR Service (`ml-delivery (3)/ml-delivery (2)/ml-delivery/.env`)
```env
BHASHINI_OCR_URL=https://dhruva-api.bhashini.gov.in/services/inference/pipeline
BHASHINI_INFERENCE_API_KEY=your_bhashini_api_key_here
BHASHINI_OCR_LANGUAGE=hi
BHASHINI_OCR_SERVICE_ID=bhashini/bodhan/indic-doc/ocr
MAX_IMAGE_UPLOAD_MB=5
```

---

## One-Time Google Cloud Setup (For LIVE Mode)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (e.g., `LearnTrack`).
2. Enable APIs:
   - **Google Calendar API**
   - **Gmail API**
3. Configure the **OAuth consent screen**:
   - User Type: External (or Internal for Google Workspace).
   - Add scopes:
     - `https://www.googleapis.com/auth/calendar.events`
     - `https://www.googleapis.com/auth/gmail.send`
     - `openid`
     - `email`
     - `profile`
   - In Testing mode, add test user Google accounts.
4. Create **OAuth 2.0 Client ID**:
   - Application type: Web application.
   - Authorized redirect URIs:
     `http://localhost:4000/api/integrations/google/callback`
5. Place the Client ID and Client Secret in `apps/api/.env` and set `GOOGLE_INTEGRATION_MODE=LIVE`.
6. Open the Meetings page (`/meetings`) and click **Authorize Google** to complete one-time consent.

---

## Running the Application on Windows

### 1. Start the API Backend (Port 4000)
```powershell
npm run dev:api
```
*(If port 4000 is occupied by a stale process, check `netstat -ano | findstr 4000` and stop the conflicting PID).*

### 2. Start the Frontend (Port 5173 / 5174)
```powershell
npm run dev:web
```
Open `http://localhost:5173/` (or `http://localhost:5174/` if 5173 is busy).

### 3. Start the ML & OCR Backend (Port 8000)
```powershell
cd "ml-delivery (3)\ml-delivery (2)\ml-delivery"
python -m uvicorn app.main:app --reload --port 8000
```
Swagger UI: `http://127.0.0.1:8000/docs`

---

## Running Automated Tests

- **API Backend Tests (25 tests):**
  ```powershell
  npm run test --workspace=@learntrack/api
  ```
- **Web Frontend Tests (10 tests):**
  ```powershell
  npm run test --workspace=@learntrack/web
  ```
- **Typecheck:**
  ```powershell
  npm run typecheck
  ```
- **ML & OCR Tests (23 tests):**
  ```powershell
  cd "ml-delivery (3)\ml-delivery (2)\ml-delivery"
  python -m pytest
  ```

Total automated test coverage: **58 automated tests passing (100% green)**.

---

## LearnCoins Rewards

LearnCoins is a server-side reward and recognition mechanism designed to foster positive study habits, attendance recovery ("comebacks"), consistency, and peer-to-peer academic support.

### 1. Reward Rules & Point Values

Points are evaluated and awarded **strictly on the server side**. The frontend client never computes or transmits point values:

- **Attendance Comeback (`COMEBACK`)**: **+30 LearnCoins**
  - Awarded when a student's latest 3-week attendance average improves by $\ge 10$ percentage points above their previous 3-week baseline.
  - Requires a minimum historical window of 6 weeks of attendance data.
  - Rate-limited to at most one comeback award per student every 4 weeks (non-overlapping 3-week windows).
- **Attendance Consistency (`CONSISTENCY`)**: **+20 LearnCoins**
  - Awarded for each week where attendance reaches or exceeds the target threshold ($\ge 90\%$).
- **Peer Tutoring Engagement (`SUPPORT_SESSION`)**: **+15 LearnCoins**
  - Awarded to the student learner upon completion of a peer tutoring session and submission of session feedback.
- **Peer Tutor Credit (`SUPPORT_SESSION_TUTOR`)**: **+20 LearnCoins**
  - Awarded to the peer tutor upon completion of the session with submitted feedback.
  - Enforces:
    - Maximum 1 rewarded session per tutor-student pair per week.
    - Maximum 3 tutor credits awarded per tutor per week.
    - Rejects self-tutoring (`tutorId !== studentId`).
- **Weekly Activity Cap**:
  - Maximum **60 LearnCoins** per student per activity week.
  - Capped by the week the activity occurred (attendance period date or tutoring session end date), not the award evaluation time, ensuring deterministic and idempotent results.

### 2. What is NEVER Rewarded (Ethical Guardrails)

To prevent perverse incentives, stress, or gaming, LearnTrack strictly prohibits rewarding the following:
- **No marks, grades, or quiz scores**: Grades are neither ingested nor rewarded. Struggling students are never penalized in the rewards system.
- **No student check-in content**: Contextual reflections, barriers, or free-text shared during check-ins are never commodified or rewarded.
- **No consent or sharing changes**: Updating privacy or data sharing settings is purely rights-based and carries no point incentives.
- **No counselling or mental health referrals**: Referrals and wellbeing case statuses are confidential and completely unlinked from rewards.

### 3. Privacy & Anti-Competition Rules

- **Private Ledgers Only**: A student can only view their own balance, progress, and reward ledger entries. `/api/rewards/me?studentId=...` strictly ignores query parameters and always scopes queries to the session user's authenticated student record.
- **No Public Leaderboards**: There are no student rankings, class leaderboards, or public displays comparing students.
- **No Punitive Copy**: The interface uses encouraging, constructive language (never "you lost points", "behind", or negative statuses).
- **Minimum Group Size ($n \ge 30$) Suppression**:
  - Cohort-level reward aggregations for leadership (`/api/rewards/summary`) enforce a minimum cohort threshold of $n \ge 30$.
  - Any cohort with fewer than 30 students suppresses all aggregate metrics (`pointsIssued: null`, `redemptionsCount: null`) and displays the explicit backend privacy note to protect individual student anonymity.

### 4. API Endpoints

All endpoints enforce authentication cookies and double-submit CSRF tokens (`X-CSRF-Token`) on mutating calls:

| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `GET` | `/api/rewards/me` | `STUDENT`, `PEER_TUTOR` | Returns student's balance, ledger entries, progress to next item, and catalog. |
| `POST` | `/api/rewards/redeem` | `STUDENT`, `PEER_TUTOR` | Redeems an item; checks stock, draw limits, and balance inside a database transaction. |
| `GET` | `/api/rewards/summary` | `HOD`, `ADMIN` | Institution metrics (points issued, points redeemed, redemptions count) and privacy-suppressed cohort breakdown. |
| `POST` | `/api/rewards/evaluate` | `HOD`, `ADMIN` | Idempotently triggers weekly reward evaluation rules across all active students. |
| `GET` | `/api/rewards/redemptions` | `FINANCE`, `ADMIN` | Returns redemptions queue containing only display fields (`id`, `studentDisplayName`, `itemName`, `cost`, `status`, `createdAt`). |
| `PATCH` | `/api/rewards/redemptions/:id` | `FINANCE`, `ADMIN` | Updates redemption status (`FULFILLED` or `CANCELLED`). Cancelling automatically restores catalog stock. |

### 5. Demo Accounts & Database Reset

All demo accounts use the standard password: `demo-password`

| Role | Email | User / Student Code | Access |
|---|---|---|---|
| **Student** | `student@learntrack.edu` | `S-104` (Aarav Sharma) | `/my-support`, `/my-rewards`, `/check-in`, `/consent` |
| **Peer Tutor** | `tutor@learntrack.edu` | `S-105` (Divya Subramanian, `T-201`) | `/tutor-workspace`, `/my-rewards` |
| **Comeback Student** | `kabir@learntrack.edu` | `S-108` (Kabir Sen) | `/my-rewards` (starts with +30 COMEBACK points) |
| **HOD / Admin** | `hod@learntrack.edu` | `STAFF-HOD-1` (Prof. Rajesh Iyer) | `/analytics`, `/rewards-admin` (totals & cohorts, evaluation) |
| **Finance** | `finance@learntrack.edu` | `STAFF-FINANCE-1` (Karthik Menon) | `/rewards-admin` (redemptions fulfilment queue) |

#### Resetting the Database
To reset and re-seed the SQLite database:
```bash
# From workspace root
npm run db:reset --workspace=@learntrack/api
```
This automatically backs up `dev.db` to `dev.db.bak`, resets tables using Prisma, seeds demo users, catalog items, synthetic attendance history, and executes the initial evaluation.

### 6. Honest System Limitations

1. **Simulated Prize Draws**: The lucky draw item in the catalog is labeled `SIMULATED` and acts as a demonstration entry queue without external lottery dependencies.
2. **No Quiz Module**: LearnTrack focuses on behavioral engagement and peer support; marks and quiz results are intentionally absent from reward logic.
3. **Seeded Cohorts Below Minimum Group Size**: In the seeded demo database, all cohorts (`CS-2024-A` with $n=3$, `ECE-2024-B` with $n=1$, `ME-2025-A` with $n=1$) have sizes below $n=30$. Consequently, cohort metrics are correctly suppressed in the HOD/Admin dashboard to showcase the privacy protection feature.
