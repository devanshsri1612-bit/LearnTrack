import React from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Role, STAFF_ROLES } from "@learntrack/contracts";
import { useAuth } from "../context/AuthContext";
import { NotificationsBell } from "./NotificationsBell";

interface NavItem {
  to: string;
  label: string;
  allowedRoles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  // Staff navigation
  {
    to: "/queue",
    label: "Priority Queue",
    allowedRoles: STAFF_ROLES,
  },
  {
    to: "/students",
    label: "Students",
    allowedRoles: STAFF_ROLES,
  },
  {
    to: "/cases",
    label: "Cases",
    allowedRoles: STAFF_ROLES,
  },
  {
    to: "/tutors",
    label: "Tutors & Sessions",
    allowedRoles: STAFF_ROLES,
  },
  {
    to: "/meetings",
    label: "Meetings",
    allowedRoles: STAFF_ROLES,
  },
  {
    to: "/analytics",
    label: "Impact & Leadership",
    allowedRoles: ["HOD", "ADMIN"],
  },
  {
    to: "/documents-ocr",
    label: "Document OCR",
    allowedRoles: STAFF_ROLES,
  },
  {
    to: "/rewards-admin",
    label: "Rewards Admin",
    allowedRoles: ["HOD", "ADMIN", "FINANCE"],
  },
  // Student & Peer Tutor navigation
  {
    to: "/my-support",
    label: "My Support",
    allowedRoles: ["STUDENT", "PEER_TUTOR"],
  },
  {
    to: "/my-rewards",
    label: "My Rewards",
    allowedRoles: ["STUDENT", "PEER_TUTOR"],
  },
  {
    to: "/check-in",
    label: "Check-in",
    allowedRoles: ["STUDENT", "PEER_TUTOR"],
  },
  {
    to: "/consent",
    label: "Consent & Sharing",
    allowedRoles: ["STUDENT", "PEER_TUTOR"],
  },
  {
    to: "/tutor-workspace",
    label: "Tutor Workspace",
    allowedRoles: ["PEER_TUTOR"],
  },
];

export const AppLayout: React.FC = () => {
  const {
    user,
    activeRole,
    setActiveRole,
    isSimulatedBannerVisible,
    contractMismatches,
    logout,
  } = useAuth();
  const navigate = useNavigate();

  if (!user || !activeRole) {
    return null;
  }

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.allowedRoles.includes(activeRole)
  );

  const handleRoleChange = (newRole: Role) => {
    setActiveRole(newRole);
    if (newRole === "FINANCE") {
      navigate("/rewards-admin");
    } else if (STAFF_ROLES.includes(newRole)) {
      navigate("/queue");
    } else if (newRole === "PEER_TUTOR") {
      navigate("/tutor-workspace");
    } else {
      navigate("/my-support");
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Persistent Simulated Data Banner when mock mode is active or response is synthetic */}
      {isSimulatedBannerVisible && (
        <div
          role="region"
          aria-label="Simulated data notice"
          className="bg-amber-900 text-amber-50 px-4 py-1.5 text-xs font-medium flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-amber-300 text-amber-950 font-bold rounded uppercase text-[10px]">
              Simulated data
            </span>
            <span>
              Synthetic dataset active. Records shown are simulated for demonstration and evaluation.
            </span>
          </div>
          <span className="text-[11px] text-amber-200">
            Indicator, not a diagnosis. A human decides.
          </span>
        </div>
      )}

      {/* Dev-only Contract Mismatch Banner */}
      {import.meta.env.DEV && contractMismatches.length > 0 && (
        <div
          role="alert"
          className="bg-rose-700 text-white px-4 py-2 text-xs space-y-1"
        >
          <div className="font-bold">
            Contract mismatch detected ({contractMismatches[0].endpoint})
          </div>
          <div>{contractMismatches[0].detail}</div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <Link
              to="/"
              className="text-base font-bold tracking-tight text-slate-900 hover:text-blue-700"
            >
              LearnTrack
            </Link>
            <span className="ml-2 text-xs text-slate-500 hidden sm:inline">
              Student Success & Intervention Orchestration
            </span>
          </div>

          <nav
            aria-label="Main navigation"
            className="flex items-center gap-1 flex-wrap"
          >
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Role-view switcher only between roles the user actually holds */}
          {user.roles.length > 1 ? (
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="role-view-switcher"
                className="text-xs font-medium text-slate-600"
              >
                Role view:
              </label>
              <select
                id="role-view-switcher"
                aria-label="Role view switcher"
                value={activeRole}
                onChange={(e) => handleRoleChange(e.target.value as Role)}
                className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-slate-50 font-semibold text-slate-800"
              >
                {user.roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span
              aria-label={`Current role: ${activeRole}`}
              className="px-2.5 py-1 rounded bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700"
            >
              Role: {activeRole}
            </span>
          )}

          <NotificationsBell />

          <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
            <span className="text-xs font-medium text-slate-800">
              {user.name}
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="text-xs px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
};

