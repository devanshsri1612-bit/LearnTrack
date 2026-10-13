import React from "react";
import {
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
} from "react-router-dom";
import { STAFF_ROLES } from "@learntrack/contracts";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { PriorityQueuePage } from "./pages/PriorityQueuePage";
import { StudentsListPage } from "./pages/StudentsListPage";
import { Student360Page } from "./pages/Student360Page";
import { CasesListPage } from "./pages/CasesListPage";
import { CaseDetailPage } from "./pages/CaseDetailPage";
import { TutorsSessionsPage } from "./pages/TutorsSessionsPage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { AnalyticsDashboardPage } from "./pages/AnalyticsDashboardPage";
import { MySupportPage } from "./pages/MySupportPage";
import { CheckInPage } from "./pages/CheckInPage";
import { ConsentPage } from "./pages/ConsentPage";
import { TutorWorkspacePage } from "./pages/TutorWorkspacePage";
import { MyRewardsPage } from "./pages/MyRewardsPage";
import { RewardsAdminPage } from "./pages/RewardsAdminPage";

const HomeRedirect: React.FC = () => {
  const { user, activeRole } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const role = activeRole ?? user.roles[0];
  if (role === "FINANCE") {
    return <Navigate to="/rewards-admin" replace />;
  }
  if (role && STAFF_ROLES.includes(role)) {
    return <Navigate to="/queue" replace />;
  }
  return <Navigate to="/my-support" replace />;
};

export const AppRoutes: React.FC = () => {
  const navigate = useNavigate();

  return (
    <AuthProvider onUnauthorizedRedirect={() => navigate("/login", { replace: true })}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<HomeRedirect />} />

          {/* Staff routes */}
          <Route
            path="/queue"
            element={
              <ProtectedRoute allowedRoles={STAFF_ROLES}>
                <PriorityQueuePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/students"
            element={
              <ProtectedRoute allowedRoles={STAFF_ROLES}>
                <StudentsListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/students/:id"
            element={
              <ProtectedRoute allowedRoles={STAFF_ROLES}>
                <Student360Page />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases"
            element={
              <ProtectedRoute allowedRoles={STAFF_ROLES}>
                <CasesListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases/:id"
            element={
              <ProtectedRoute allowedRoles={STAFF_ROLES}>
                <CaseDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tutors"
            element={
              <ProtectedRoute allowedRoles={STAFF_ROLES}>
                <TutorsSessionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/meetings"
            element={
              <ProtectedRoute allowedRoles={STAFF_ROLES}>
                <MeetingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute allowedRoles={["HOD", "ADMIN"]}>
                <AnalyticsDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rewards-admin"
            element={
              <ProtectedRoute allowedRoles={["HOD", "ADMIN", "FINANCE"]}>
                <RewardsAdminPage />
              </ProtectedRoute>
            }
          />

          {/* Student & Peer Tutor routes */}
          <Route
            path="/my-support"
            element={
              <ProtectedRoute allowedRoles={["STUDENT", "PEER_TUTOR"]}>
                <MySupportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-rewards"
            element={
              <ProtectedRoute allowedRoles={["STUDENT", "PEER_TUTOR"]}>
                <MyRewardsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/check-in"
            element={
              <ProtectedRoute allowedRoles={["STUDENT", "PEER_TUTOR"]}>
                <CheckInPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/consent"
            element={
              <ProtectedRoute allowedRoles={["STUDENT", "PEER_TUTOR"]}>
                <ConsentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tutor-workspace"
            element={
              <ProtectedRoute allowedRoles={["PEER_TUTOR"]}>
                <TutorWorkspacePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="*"
            element={
              <div className="p-6 bg-white rounded-xl border border-slate-200 text-sm text-slate-700 flex items-center justify-between">
                <span>Page not found (404).</span>
                <Link
                  to="/"
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  Return to Home
                </Link>
              </div>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  );
};

