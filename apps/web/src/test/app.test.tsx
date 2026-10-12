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
});

