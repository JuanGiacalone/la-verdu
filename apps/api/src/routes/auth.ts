import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type AdminSession, loginAdmin } from "../auth/admin-auth.js";
import {
  clearSessionCookie,
  createSessionStore,
  getSessionId,
  type SessionStore,
  setSessionCookie,
} from "../auth/session.js";
import type { Database } from "../db/client.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function registerAuthRoutes(
  app: FastifyInstance,
  database: Database,
  sessionStore: SessionStore,
  isProduction: boolean,
): void {
  app.post("/admin/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Usuario y contraseña son requeridos." });
    }

    const result = await loginAdmin(database, parsed.data.username, parsed.data.password);
    if (!result.success || !result.session) {
      return reply.code(401).send({ error: result.error ?? "Credenciales inválidas." });
    }

    const sessionId = crypto.randomUUID();
    sessionStore.set(sessionId, result.session);
    setSessionCookie(reply, sessionId, isProduction);

    return reply.code(200).send({
      username: result.session.username,
      role: result.session.role,
    });
  });

  app.post("/admin/auth/logout", async (request, reply) => {
    const sessionId = getSessionId(request);
    if (sessionId) {
      sessionStore.delete(sessionId);
    }
    clearSessionCookie(reply);
    return reply.code(200).send({ ok: true });
  });

  app.get("/admin/auth/me", async (request, reply) => {
    const sessionId = getSessionId(request);
    if (!sessionId) {
      return reply.code(401).send({ error: "No autenticado." });
    }
    const session = sessionStore.get(sessionId);
    if (!session) {
      clearSessionCookie(reply);
      return reply.code(401).send({ error: "Sesión expirada." });
    }
    return reply.code(200).send({
      username: session.username,
      role: session.role,
    });
  });
}

export function requireAuth(
  sessionStore: SessionStore,
): (
  request: { cookies: Record<string, string> },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
) => AdminSession | null {
  return (request, reply) => {
    const sessionId = (request.cookies as Record<string, string>).la_verdu_session;
    if (!sessionId) {
      reply.code(401).send({ error: "No autenticado." });
      return null;
    }
    const session = sessionStore.get(sessionId);
    if (!session) {
      reply.code(401).send({ error: "Sesión expirada." });
      return null;
    }
    return session;
  };
}

export { createSessionStore, type SessionStore };
