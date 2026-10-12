---
trigger: always_on
---

## LearnTrack rewards: rules
- Follow existing patterns: Express routes with requireAuth and role checks in apps/api/src/app.ts,
  zod schemas in packages/contracts/src/index.ts, MSW handlers in apps/web/src/mocks/handlers.ts,
  tests in apps/api/test and apps/web/src/test.
- Do not modify existing auth, risk-assessment, case or consent logic. Add new code beside it.
- Never commit node_modules, dist, .env files or the database.
- Points are awarded ONLY on the server. The client never sends point values.
- Never reward marks/quiz scores, check-in content, consent changes or counselling status.
- No leaderboards, no showing one student's points to another, no punitive wording.
- Anything sponsored or invented is labelled SIMULATED.
- Plan first, wait for my approval, then build one prompt at a time. Run typecheck and tests
  and paste the real output. I must be able to explain every file to a judge.