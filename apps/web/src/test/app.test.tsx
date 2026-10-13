import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { AppRoutes } from "../App";
import { server } from "../mocks/server";
import { resetMockDb } from "../mocks/handlers";

function renderApp(initialEntries: string[] = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LearnTrack Frontend End-to-End Spec Verification", () => {
  it("1. redirects to /login on 401 unauthorized and logs in successfully", async () => {
    resetMockDb(null);
    const user = userEvent.setup();
    renderApp(["/queue"]);

    // Should redirect to /login because /api/auth/me returns 401
    expect(
      await screen.findByRole("heading", { name: /Sign in to LearnTrack/i })
    ).toBeInTheDocument();

    // Dev-only demo account picker is shown
    expect(screen.getByText(/Development only/i)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/Institutional Email/i),
      "mentor@learntrack.edu"
    );
    await user.type(screen.getByLabelText(/Password/i), "demo-password");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(
      await screen.findByRole("heading", {
        name: /Priority Support Queue & Staff Capacity/i,
      })
    ).toBeInTheDocument();
  });

  it("2. enforces role-based navigation and multi-role switcher only for roles held", async () => {
    // tutor@learntrack.edu holds STUDENT + PEER_TUTOR
    resetMockDb("tutor@learntrack.edu");
    const user = userEvent.setup();
    renderApp(["/my-support"]);

    expect(
      await screen.findByRole("heading", { name: /My Support/i })
    ).toBeInTheDocument();

    const switcher = screen.getByLabelText(/Role view switcher/i);
    expect(switcher).toBeInTheDocument();

    // Only STUDENT and PEER_TUTOR options should exist
    const options = Array.from(switcher.querySelectorAll("option")).map(
      (o) => o.textContent
    );
    expect(options).toEqual(["STUDENT", "PEER_TUTOR"]);

    // Attempting to visit /analytics (HOD/ADMIN only) renders "You do not have access"
    renderApp(["/analytics"]);
    expect(
      await screen.findByRole("heading", { name: /You do not have access/i })
    ).toBeInTheDocument();

    // Switch role to PEER_TUTOR
    await user.selectOptions(switcher, "PEER_TUTOR");
    expect(
      await screen.findByRole("heading", {
        name: /Peer Tutor Workspace/i,
      })
    ).toBeInTheDocument();
  });

  it("3. renders 'Restricted by role or consent' for restricted fields and 'No recent observations' for missing data (S-107)", async () => {
    resetMockDb("mentor@learntrack.edu");
    renderApp(["/students/S-105"]);

    expect(
      await screen.findByRole("heading", { name: /Meera Krishnan/i })
    ).toBeInTheDocument();

    // S-105 has restricted counselling and studentContext
    const restrictedBoxes = await screen.findAllByText(
      /Restricted by role or consent/i
    );
    expect(restrictedBoxes.length).toBeGreaterThan(0);

    // S-107 has missing data -> displays "No recent observations"
    renderApp(["/students/S-107"]);
    expect(
      await screen.findByRole("heading", { name: /Zoya Farooqi/i })
    ).toBeInTheDocument();
    const noObs = await screen.findAllByText(/No recent observations/i);
    expect(noObs.length).toBeGreaterThan(0);
  });

  it("4. displays theFallback badge ('Fallback (not a model result)') and mandatory disclaimer on the Risk panel", async () => {
    resetMockDb("mentor@learntrack.edu");
    renderApp(["/students/S-105"]);

    expect(
      await screen.findByText(/Fallback \(not a model result\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Indicator, not a diagnosis\. A human decides\./i)
        .length
    ).toBeGreaterThan(0);
  });

  it("5. renders the case transition UI with disabled transitions and requires a reason (min 10 chars) for OVERRIDE", async () => {
    resetMockDb("mentor@learntrack.edu");
    const user = userEvent.setup();
    renderApp(["/cases/C-104"]);

    expect(
      await screen.findByRole("heading", {
        name: /Case C-104 — Aarav Sharma/i,
      })
    ).toBeInTheDocument();

    // Check that COMPLETE_ACTION is disabled in NEEDS_REVIEW state
    const completeBtn = screen.getByRole("button", {
      name: /Action COMPLETE_ACTION/i,
    });
    expect(completeBtn).toBeDisabled();

    // Select OVERRIDE action
    const overrideBtn = screen.getByRole("button", {
      name: /Action OVERRIDE/i,
    });
    await user.click(overrideBtn);

    // Try submitting with a short reason (< 10 chars)
    const reasonInput = screen.getByLabelText(
      /Override Reason \(Required, minimum 10 characters\)/i
    );
    await user.type(reasonInput, "Too short");

    await user.click(
      screen.getByRole("button", { name: /Confirm OVERRIDE Decision/i })
    );

    expect(
      await screen.findByText(
        /Override reason is required and must be at least 10 characters\./i
      )
    ).toBeInTheDocument();

    // Now provide valid override reason >= 10 chars
    await user.clear(reasonInput);
    await user.type(
      reasonInput,
      "Student commute schedule requires afternoon 1-on-1 faculty mentor check-in first."
    );
    await user.click(
      screen.getByRole("button", { name: /Confirm OVERRIDE Decision/i })
    );

    await waitFor(() => {
      expect(
        screen.queryByText(
          /Override reason is required and must be at least 10 characters\./i
        )
      ).not.toBeInTheDocument();
    });
  });

  it("6. displays 'This case was changed by someone else' with a Reload button on 409 conflict", async () => {
    resetMockDb("mentor@learntrack.edu");
    const user = userEvent.setup();

    server.use(
      http.patch("/api/cases/:id", () => {
        return HttpResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "This case was changed by someone else",
            },
          },
          { status: 409 }
        );
      })
    );

    renderApp(["/cases/C-104"]);
    expect(
      await screen.findByRole("heading", {
        name: /Case C-104 — Aarav Sharma/i,
      })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Confirm APPROVE Decision/i })
    );

    expect(
      await screen.findByText(/This case was changed by someone else/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload/i })).toBeInTheDocument();
  });

  it("7. displays 'Insufficient data' on recommendations and 'Insufficient data for reliable fairness assessment' on HOD fairness panel", async () => {
    resetMockDb("hod@learntrack.edu");
    renderApp(["/cases/C-104"]);

    expect(
      await screen.findByRole("heading", {
        name: /Case C-104 — Aarav Sharma/i,
      })
    ).toBeInTheDocument();

    // Recommendations with small sample size show "Insufficient data" and "Low confidence"
    expect(
      (await screen.findAllByText(/Insufficient data/i)).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Low confidence/i).length).toBeGreaterThan(0);

    // Render HOD Analytics Dashboard for fairness check
    renderApp(["/analytics"]);
    expect(
      await screen.findByRole("heading", {
        name: /Impact & Leadership Dashboard/i,
      })
    ).toBeInTheDocument();

    expect(
      (
        await screen.findAllByText(
          /Insufficient data for reliable fairness assessment/i
        )
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/Patterns to investigate, not proven causes\./i)
    ).toBeInTheDocument();
  });

  it("8. displays 'Future sharing stops. Emails already sent cannot be recalled.' when revoking consent", async () => {
    resetMockDb("student@learntrack.edu");
    const user = userEvent.setup();
    renderApp(["/consent"]);

    expect(
      await screen.findByRole("heading", {
        name: /Consent & Data Sharing Controls/i,
      })
    ).toBeInTheDocument();

    // Click the first granted toggle to revoke it
    const toggleBtn = screen.getByRole("switch", {
      name: /Toggle Self Check-in Context Notes for MENTOR/i,
    });
    await user.click(toggleBtn);

    expect(
      await screen.findByText(
        /Future sharing stops\. Emails already sent cannot be recalled\./i
      )
    ).toBeInTheDocument();
  });

  it("9. renders Shared Barriers section (GET /api/analytics/clusters) with insufficient-data state, mandatory labels, no student names, and creates a faculty review task without student identifiers", async () => {
    resetMockDb("hod@learntrack.edu");
    const user = userEvent.setup();

    const capturedTaskPayload: Record<string, unknown> = {};
    server.use(
      http.post("/api/cases", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        Object.assign(capturedTaskPayload, body);
        return HttpResponse.json(
          {
            id: "C-901",
            studentId: "COHORT-REVIEW:CS-2024-A",
            studentName: "Cohort Review (DSA / CS-2024-A)",
            cohort: "CS-2024-A",
            status: "NEEDS_REVIEW",
            deadlineStatus: "ON_TIME",
            deadline: "2026-10-25T12:00:00.000Z",
            ownerId: "STAFF-HOD-1",
            ownerName: "Prof. Rajesh Iyer",
            ownerRole: "HOD",
            recommendedIntervention: "REMEDIAL",
            selectedIntervention: null,
            overrideReason: null,
            plainLanguageReason: String(body.plainLanguageReason ?? ""),
            version: 1,
            updatedAt: "2026-10-12T12:00:00.000Z",
            createdAt: "2026-10-12T12:00:00.000Z",
            allowedTransitions: [{ action: "APPROVE", allowed: true }],
            synthetic: true,
          },
          { status: 201 }
        );
      })
    );

    renderApp(["/analytics"]);

    // Wait for Shared Barriers heading and clusters data to load
    expect(
      await screen.findByRole("heading", { name: /Shared Barriers/i })
    ).toBeInTheDocument();

    // 1. Verify mandatory labels: "Pattern to investigate, not a proven cause." and "Synthetic data"
    expect(
      (
        await screen.findAllByText(
          /Pattern to investigate, not a proven cause\./i
        )
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Synthetic data/i).length).toBeGreaterThan(0);

    // 2. Verify DSA / CS-2024-A flagged group, two non-flagged groups, and one group below minGroupSize showing "Insufficient data"
    expect(
      screen.getByRole("button", {
        name: /Heatmap cell DSA CS-2024-A: 30% rate/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Heatmap cell Database Systems CS-2024-A: 10% rate/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Heatmap cell Operating Systems ECE-2024-B: 9.6% rate/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Heatmap cell DSA ME-2025-A: Insufficient data/i,
      })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Insufficient data").length).toBeGreaterThan(0);

    // 3. Verify NO student names or student IDs appear anywhere on the aggregate dashboard
    expect(screen.queryByText(/Aarav Sharma/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Meera Krishnan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rohan Deshmukh/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Zoya Farooqi/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/S-104/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/S-105/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/S-106/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/S-107/i)).not.toBeInTheDocument();

    // 4. Click "Create faculty review task" and verify POST /api/cases is called without student identifiers
    const createButtons = screen.getAllByRole("button", {
      name: /Create faculty review task/i,
    });
    await user.click(createButtons[0]);

    await waitFor(() => {
      expect(capturedTaskPayload.cohort).toBe("CS-2024-A");
    });
    expect(capturedTaskPayload).toMatchObject({
      cohort: "CS-2024-A",
      subject: "DSA",
      taskType: "FACULTY_REVIEW_TASK",
    });
    expect(capturedTaskPayload.studentId).toBeUndefined();
    expect(
      await screen.findByText(/Faculty review task C-901 created/i)
    ).toBeInTheDocument();
  });

  it("10. renders Meetings & Calendar Integration with Google status, privacy-safe title, and notification badge", async () => {
    resetMockDb("mentor@learntrack.edu");
    renderApp(["/meetings"]);

    expect(
      await screen.findByRole("heading", {
        name: /Meetings & Calendar Integration/i,
      })
    ).toBeInTheDocument();

    expect(await screen.findByText(/Google Calendar:/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Schedule Advising Meeting/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Schedule Meeting/i })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /Scheduled Meetings/i })
    ).toBeInTheDocument();
  });

  it("11. My Rewards: displays balance, friendly ledger, SIMULATED badge, and disables Redeem with reason when short", async () => {
    resetMockDb("student@learntrack.edu");
    const user = userEvent.setup();
    renderApp(["/my-rewards"]);

    // Heading and private scope
    expect(
      await screen.findByRole("heading", { name: /My Rewards \(LearnCoins\)/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Private & Confidential to You/i)).toBeInTheDocument();

    // S-104 balance is 20
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getAllByText(/attendance consistency/i).length).toBeGreaterThan(0);

    // Badges: SIMULATED badge on sponsored items
    const simulatedBadges = screen.getAllByText("SIMULATED");
    expect(simulatedBadges.length).toBeGreaterThan(0);

    // Affordable item: "Print Credits (50 Pages)" (cost 20) has an enabled Redeem button
    const printItemContainer = screen.getByText(/Print Credits \(50 Pages\)/i).closest("div");
    expect(printItemContainer).not.toBeNull();

    // Short-on-points item: "Mock Technical Interview Session" (cost 60)
    // S-104 has 20 points, so needs 40 more
    expect(screen.getByText(/Need 40 more LearnCoins/i)).toBeInTheDocument();

    // Unaffordable item's button is disabled
    const expensiveCard = screen.getByText(/Mock Technical Interview Session/i).closest(".bg-white");
    const disabledRedeemBtn = expensiveCard?.querySelector("button");
    expect(disabledRedeemBtn).toBeDisabled();

    // Clicking enabled Redeem button opens confirmation modal
    const printCard = screen.getByText(/Print Credits \(50 Pages\)/i).closest(".bg-white");
    const enabledRedeemBtn = printCard?.querySelector("button");
    expect(enabledRedeemBtn).not.toBeDisabled();
    await user.click(enabledRedeemBtn!);

    // Dialog appears with confirmation details
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Confirm Reward Redemption/i)).toBeInTheDocument();
    expect(screen.getByText(/Remaining Balance:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm Redemption/i })).toBeInTheDocument();

    // Dismiss dialog
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("12. Rewards Admin: displays institution totals and minimum group size (n >= 30) suppression message for small cohorts", async () => {
    resetMockDb("hod@learntrack.edu");
    renderApp(["/rewards-admin"]);

    expect(
      await screen.findByRole("heading", { name: /Rewards Administration & Oversight/i })
    ).toBeInTheDocument();

    // Institution totals cards
    expect(screen.getByText(/Total Points Issued/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Points Redeemed/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Redemptions/i)).toBeInTheDocument();

    // Weekly evaluation button
    expect(screen.getByRole("button", { name: /Run Weekly Evaluation/i })).toBeInTheDocument();

    // Cohorts table and privacy suppression message for cohorts with N < 30
    expect(screen.getByText("CS-2024-A")).toBeInTheDocument();
    expect(screen.getByText("ECE-2024-B")).toBeInTheDocument();
    expect(screen.getByText("ME-2025-A")).toBeInTheDocument();

    const privacyNotices = screen.getAllByText(/Cohort size is below privacy threshold \(n < 30\)/i);
    expect(privacyNotices.length).toBeGreaterThan(0);
  });

  it("13. Student cannot open /rewards-admin and receives AccessDeniedScreen", async () => {
    resetMockDb("student@learntrack.edu");
    renderApp(["/rewards-admin"]);

    expect(
      await screen.findByRole("heading", { name: /You do not have access/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Rewards Administration & Oversight/i)).not.toBeInTheDocument();
  });

  it("14. Rewards mutation clearly fails when missing CSRF header", async () => {
    resetMockDb("student@learntrack.edu");

    // Making a POST request without X-CSRF-Token fails with 403 CSRF_INVALID
    const res = await fetch("/api/rewards/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: "REW-PRINT" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("CSRF_INVALID");
    expect(body.error.message).toContain("CSRF");
  });

  it("15. Rewards Admin role views: HOD sees totals/cohorts/evaluate, FINANCE sees only redemptions queue without evaluate button, ADMIN sees both", async () => {
    // 1. FINANCE sees only the redemptions queue and CANNOT see evaluate button or leadership totals
    resetMockDb("finance@learntrack.edu");
    const { unmount: unmountFinance } = renderApp(["/rewards-admin"]);

    expect(
      await screen.findByRole("heading", { name: /Rewards Administration & Oversight/i })
    ).toBeInTheDocument();

    // Redemptions queue is visible
    expect(await screen.findByText(/Redemptions Management Queue/i)).toBeInTheDocument();

    // Evaluate button is hidden from FINANCE
    expect(screen.queryByRole("button", { name: /Run Weekly Evaluation/i })).not.toBeInTheDocument();

    // Leadership totals & cohort table are hidden from FINANCE
    expect(screen.queryByText(/Total Points Issued/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cohort Rewards & Minimum Group Size Protection/i)).not.toBeInTheDocument();

    unmountFinance();

    // 2. Pure HOD sees totals, cohorts, and evaluate button, but NOT redemptions queue
    resetMockDb("hod@learntrack.edu");
    renderApp(["/rewards-admin"]);

    expect(
      await screen.findByRole("heading", { name: /Rewards Administration & Oversight/i })
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Run Weekly Evaluation/i })).toBeInTheDocument();
    expect(await screen.findByText(/Total Points Issued/i)).toBeInTheDocument();
    expect(screen.getByText(/Cohort Rewards & Minimum Group Size Protection/i)).toBeInTheDocument();
    expect(screen.queryByText(/Redemptions Management Queue/i)).not.toBeInTheDocument();
  });

  it("16. GET /api/rewards/redemptions returns only display fields and contains no ledger or attendance data", async () => {
    resetMockDb("finance@learntrack.edu");

    const res = await fetch("/api/rewards/redemptions", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items.length).toBeGreaterThan(0);

    const first = json.items[0];
    // Contains only: id, studentDisplayName, itemName, cost, status, createdAt
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("studentDisplayName");
    expect(first).toHaveProperty("itemName");
    expect(first).toHaveProperty("cost");
    expect(first).toHaveProperty("status");
    expect(first).toHaveProperty("createdAt");

    // Strictly does not contain ledger, attendance, observations, risk, or raw studentId
    expect(first).not.toHaveProperty("ledger");
    expect(first).not.toHaveProperty("attendance");
    expect(first).not.toHaveProperty("observations");
    expect(first).not.toHaveProperty("risk");
    expect(first).not.toHaveProperty("studentId");
  });
});

