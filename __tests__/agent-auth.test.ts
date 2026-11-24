import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerValues = new Map<string, string>();

const findFirst = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerValues.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: { user: { findFirst: (args: unknown) => findFirst(args) } },
  withDbRetry: <T>(fn: () => Promise<T>) => fn(),
}));

import { getAgentIdentity, isValidAgentKey } from "@/lib/agent-auth";

const KEY = "a".repeat(48);

describe("agent auth", () => {
  beforeEach(() => {
    headerValues.clear();
    findFirst.mockReset();
    // Emulates Postgres `mode: "insensitive"` matching.
    findFirst.mockImplementation(
      async ({ where }: { where: { email: { equals: string } } }) =>
        where.email.equals.toLowerCase() === "owner@example.com"
          ? { id: "user_123" }
          : null,
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AGENT_API_KEY", KEY);
    vi.stubEnv("AGENT_USER_EMAIL", "Owner@Example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the configured bearer key and returns the agent user", async () => {
    headerValues.set("authorization", `Bearer ${KEY}`);
    headerValues.set("x-workspace-id", "ws_1");
    await expect(getAgentIdentity()).resolves.toEqual({
      userId: "user_123",
      requestedWorkspaceId: "ws_1",
    });
  });

  it("rejects a wrong key", async () => {
    headerValues.set("authorization", `Bearer ${"b".repeat(48)}`);
    await expect(getAgentIdentity()).resolves.toBeNull();
  });

  it("rejects requests without a bearer header", async () => {
    await expect(getAgentIdentity()).resolves.toBeNull();
  });

  it("is disabled when the key is missing or too short", async () => {
    headerValues.set("authorization", "Bearer short");
    vi.stubEnv("AGENT_API_KEY", "short");
    await expect(getAgentIdentity()).resolves.toBeNull();
  });

  it("is disabled when AGENT_USER_EMAIL is missing", async () => {
    headerValues.set("authorization", `Bearer ${KEY}`);
    vi.stubEnv("AGENT_USER_EMAIL", "");
    await expect(getAgentIdentity()).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns null when no user has that email", async () => {
    headerValues.set("authorization", `Bearer ${KEY}`);
    vi.stubEnv("AGENT_USER_EMAIL", "nobody@example.com");
    await expect(getAgentIdentity()).resolves.toBeNull();
  });

  it("does not touch the database for a wrong key", async () => {
    headerValues.set("authorization", `Bearer ${"b".repeat(48)}`);
    await getAgentIdentity();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("compares keys of different lengths safely", () => {
    expect(isValidAgentKey("x", KEY)).toBe(false);
    expect(isValidAgentKey(KEY, KEY)).toBe(true);
  });
});
