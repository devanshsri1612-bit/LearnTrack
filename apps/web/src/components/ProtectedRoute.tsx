import React from "react";
import { Navigate } from "react-router-dom";
import { Role } from "@learntrack/contracts";
import { useAuth } from "../context/AuthContext";
import { AccessDeniedScreen, LoadingSkeleton } from "./StateViews";

export const ProtectedRoute: React.FC<{
  allowedRoles?: Role[];
  children: React.ReactNode;
}> = ({ allowedRoles, children }) => {
  const { user, activeRole, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <LoadingSkeleton lines={4} label="Checking authentication..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (
    allowedRoles &&
    allowedRoles.length > 0 &&
    !user.roles.some((r) => allowedRoles.includes(r)) &&
    (!activeRole || !allowedRoles.includes(activeRole))
  ) {
    return <AccessDeniedScreen />;
  }

  return <>{children}</>;
};

