# LearnTrack: Student Success & Intervention Orchestration Platform

LearnTrack is a multi-role student support, early intervention, and learning analytics platform designed to orchestrate academic and advising care between students, peer tutors, faculty mentors, department heads (HOD), and finance support officers.

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

## Quick start
1. npm install
2. Copy apps/api/.env.example to apps/api/.env
3. npm run db:reset --workspace=@learntrack/api
4. npm run dev   (API on :4000, web on :5173)
Demo password for all seeded accounts: demo-password
Windows note: if npm fails with "spawn ... ENOENT", set COMSPEC to
C:\Windows\System32\cmd.exe for that terminal.
