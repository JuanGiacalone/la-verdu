import fastifyCookie from "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminSession } from "./admin-auth.js";

const SESSION_COOKIE = "la_verdu_session";

export interface SessionStore {
  get(sessionId: string): AdminSession | undefined;
  set(sessionId: string, session: AdminSession): void;
  delete(sessionId: string): void;
}

/**
 * In-memory session store. Sufficient for a single instance. For multi-instance
 * deployments, replace with a Redis or database-backed store.
 */
export function createSessionStore(): SessionStore {
  const sessions = new Map<string, AdminSession>();
  return {
    get: (id) => sessions.get(id),
    set: (id, session) => {
      sessions.set(id, session);
    },
    delete: (id) => {
      sessions.delete(id);
    },
  };
}

export async function registerSessionPlugin(app: FastifyInstance, secret: string): Promise<void> {
  await app.register(fastifyCookie, { secret });
}

export function getSessionId(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE];
}

export function setSessionCookie(
  reply: FastifyReply,
  sessionId: string,
  isProduction: boolean,
): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60, // 8 hours
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export { SESSION_COOKIE };
