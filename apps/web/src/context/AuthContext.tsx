import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Role, LoginRequest } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { isMockModeEnabled, registerApiClientListeners } from "../api/client";

interface AuthContextValue {
  user: User | null;
  activeRole: Role | null;
  setActiveRole: (role: Role) => void;
  isLoading: boolean;
  isSimulatedBannerVisible: boolean;
  contractMismatches: Array<{ endpoint: string; detail: string }>;
  login: (payload: LoginRequest) => Promise<User>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{
  children: React.ReactNode;
  onUnauthorizedRedirect: () => void;
}> = ({ children, onUnauthorizedRedirect }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeRole, setActiveRoleState] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [syntheticDetected, setSyntheticDetected] = useState<boolean>(false);
  const [contractMismatches, setContractMismatches] = useState<
    Array<{ endpoint: string; detail: string }>
  >([]);

  const syncRoleWithUser = useCallback((loadedUser: User | null) => {
    if (!loadedUser || loadedUser.roles.length === 0) {
      setActiveRoleState(null);
      return;
    }
    setActiveRoleState((prev) =>
      prev && loadedUser.roles.includes(prev) ? prev : loadedUser.roles[0]
    );
  }, []);

  const refreshMe = useCallback(async () => {
    setIsLoading(true);
    try {
      const me = await api.auth.me();
      setUser(me);
      syncRoleWithUser(me);
    } catch {
      setUser(null);
      setActiveRoleState(null);
    } finally {
      setIsLoading(false);
    }
  }, [syncRoleWithUser]);

  useEffect(() => {
    registerApiClientListeners({
      onUnauthorized: () => {
        setUser(null);
        setActiveRoleState(null);
        onUnauthorizedRedirect();
      },
      onSyntheticDetected: () => {
        setSyntheticDetected(true);
      },
      onContractMismatch: (endpoint, issues) => {
        setContractMismatches((prev) => [
          {
            endpoint,
            detail: issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          },
          ...prev.slice(0, 4),
        ]);
      },
    });
  }, [onUnauthorizedRedirect]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const setActiveRole = useCallback(
    (role: Role) => {
      // Never allow switching to a role the user does not actually hold
      if (user && user.roles.includes(role)) {
        setActiveRoleState(role);
      }
    },
    [user]
  );

  const login = async (payload: LoginRequest): Promise<User> => {
    const loggedIn = await api.auth.login(payload);
    setUser(loggedIn);
    syncRoleWithUser(loggedIn);
    return loggedIn;
  };

  const logout = async (): Promise<void> => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
      setActiveRoleState(null);
    }
  };

  const isSimulatedBannerVisible =
    isMockModeEnabled() || syntheticDetected || Boolean(user?.synthetic);

  return (
    <AuthContext.Provider
      value={{
        user,
        activeRole,
        setActiveRole,
        isLoading,
        isSimulatedBannerVisible,
        contractMismatches,
        login,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

