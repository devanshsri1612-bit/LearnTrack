import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoginRequestSchema, STAFF_ROLES } from "@learntrack/contracts";
import { useAuth } from "../context/AuthContext";
import { DEMO_USERS } from "../mocks/handlers";

export const LoginPage: React.FC = () => {
  const { login, isSimulatedBannerVisible } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    const parsed = LoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const nextErrors: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "email") nextErrors.email = issue.message;
        if (issue.path[0] === "password") nextErrors.password = issue.message;
      }
      setFieldErrors(nextErrors);
      return;
    }

    setIsPending(true);
    try {
      const user = await login(parsed.data);
      const firstRole = user.roles[0];
      if (firstRole && STAFF_ROLES.includes(firstRole)) {
        navigate("/queue");
      } else {
        navigate("/my-support");
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Unable to sign in. Please try again."
      );
    } finally {
      setIsPending(false);
    }
  };

  const handlePickDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("demo-password");
    setFieldErrors({});
    setSubmitError(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {isSimulatedBannerVisible && (
        <div
          role="region"
          aria-label="Simulated data notice"
          className="bg-amber-900 text-amber-50 px-4 py-1.5 text-xs font-medium flex items-center justify-between"
        >
          <span>Simulated data mode enabled</span>
          <span>Indicator, not a diagnosis. A human decides.</span>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Sign in to LearnTrack
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Student Success and Intervention Orchestration Engine
            </p>
          </div>

          {submitError && (
            <div
              role="alert"
              className="p-3 rounded-md bg-rose-50 border border-rose-300 text-xs text-rose-800"
            >
              {submitError}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-slate-700"
              >
                Institutional Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mentor@learntrack.edu"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-rose-600" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-rose-600" role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2 px-4 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {/* Dev-only demo account picker rendered only when import.meta.env.DEV is true */}
          {import.meta.env.DEV && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Demo Account Picker
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold uppercase">
                  Development only
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Select a role account below to populate credentials (cookies-only session, role verified by server):
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {Object.values(DEMO_USERS).map((demo) => (
                  <button
                    key={demo.email}
                    type="button"
                    onClick={() => handlePickDemoAccount(demo.email)}
                    className="text-left px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-800">
                      {demo.name} ({demo.email})
                    </span>
                    <span className="text-[10px] font-semibold text-blue-700">
                      {demo.roles.join(" + ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

