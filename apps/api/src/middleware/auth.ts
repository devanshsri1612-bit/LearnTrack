import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { Role, User } from "@learntrack/contracts";
import { env } from "../config/env.js";
import { prisma } from "../db.js";

export const SESSION_COOKIE_NAME = "lt_session";
export const CSRF_COOKIE_NAME = "lt_csrf";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

interface SessionPayload {
  userId: string;
  exp: number;
}

function signPayload(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

function verifyPayload(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(data)
    .digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(data, "base64url").toString("utf-8")
    ) as SessionPayload;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, userId: string) {
  const maxAgeMs = env.SESSION_EXPIRY_HOURS * 60 * 60 * 1000;
  const token = signPayload({
    userId,
    exp: Date.now() + maxAgeMs,
  });

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: maxAgeMs,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  });
}

export async function loadUserFromCookie(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!rawToken) {
    return next();
  }
  const verified = verifyPayload(rawToken);
  if (!verified) {
    return next();
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: verified.userId },
      include: {
        studentProfile: true,
        staffProfile: true,
        tutorProfile: true,
      },
    });
    if (!dbUser || dbUser.status !== "ACTIVE") {
      return next();
    }

    const roles = JSON.parse(dbUser.rolesJson) as Role[];
    req.user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      roles,
      studentId: dbUser.studentProfile?.id ?? null,
      staffId: dbUser.staffProfile?.id ?? null,
      tutorId: dbUser.tutorProfile?.id ?? null,
      synthetic: dbUser.synthetic,
    };
  } catch {
    // Ignore session lookup error
  }
  return next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required. Please sign in.",
      },
    });
    return;
  }
  next();
}

export function requireRoles(allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required. Please sign in.",
        },
      });
      return;
    }
    const hasRole = req.user.roles.some((r) => allowed.includes(r));
    if (!hasRole) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You do not have access to this resource.",
        },
      });
      return;
    }
    next();
  };
}

