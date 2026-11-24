import { createHash, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { prisma, withDbRetry } from "@/lib/db/client";

/**
 * Machine-to-machine access for an external AI agent (e.g. Hermes).
 *
 * When both AGENT_API_KEY and AGENT_USER_EMAIL are set, a request carrying
 * `Authorization: Bearer <AGENT_API_KEY>` is treated as the user with that
 * login email, so the agent can call the existing /api routes with the same
 * workspace and permission checks a signed-in member gets. Unset either
 * variable to turn agent access off entirely.
 *
 * The agent picks a workspace with the `x-workspace-id` header (falls back to
 * the user's oldest membership, like the dashboard).
 */
const MIN_KEY_LENGTH = 32;

export const AGENT_WORKSPACE_HEADER = "x-workspace-id";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function isValidAgentKey(presented: string, expected: string): boolean {
  // Compare fixed-length digests so neither length nor content leaks via timing.
  return timingSafeEqual(digest(presented), digest(expected));
}

export type AgentIdentity = {
  userId: string;
  requestedWorkspaceId: string | null;
};

export async function getAgentIdentity(): Promise<AgentIdentity | null> {
  const expectedKey = process.env.AGENT_API_KEY;
  const email = process.env.AGENT_USER_EMAIL?.trim().toLowerCase();
  if (!expectedKey || expectedKey.length < MIN_KEY_LENGTH || !email) {
    return null;
  }

  const headerStore = await headers();
  const authorization = headerStore.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const presented = authorization.slice("Bearer ".length).trim();
  if (!presented || !isValidAgentKey(presented, expectedKey)) {
    console.warn("[agent-auth] rejected: bearer token does not match AGENT_API_KEY");
    return null;
  }

  const user = await withDbRetry(() =>
    prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    }),
  );
  if (!user) {
    console.warn("[agent-auth] rejected: no user matches AGENT_USER_EMAIL");
    return null;
  }

  return {
    userId: user.id,
    requestedWorkspaceId: headerStore.get(AGENT_WORKSPACE_HEADER),
  };
}
