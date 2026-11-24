import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getContext, getAccount } = vi.hoisted(() => ({
  getContext: vi.fn(),
  getAccount: vi.fn(),
}));

vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: () => getContext(),
  canManageInstagramAccounts: (ctx: { role: string; permissions: string[] }) =>
    ctx.role === "OWNER" || ctx.permissions.includes("MANAGE_INSTAGRAM_ACCOUNTS"),
}));
vi.mock("@/lib/instagram-accounts", () => ({
  getWorkspaceInstagramAccount: (...args: unknown[]) => getAccount(...args),
}));
vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: (value: string) => `plain-${value}`,
}));

import {
  createReelContainer,
  publishMediaContainer,
} from "@/lib/meta/client";
import { isPublicHttpsUrl } from "@/lib/server/reel-publishing";
import { GET, POST } from "@/app/api/instagram/reels/route";
import { POST as PUBLISH } from "@/app/api/instagram/reels/publish/route";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function postRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VIDEO = "https://cdn.example.com/clip.mp4";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  getContext.mockResolvedValue({
    workspaceId: "ws_1",
    role: "OWNER",
    permissions: [],
  });
  getAccount.mockResolvedValue({ accessToken: "enc", username: "pink.trainer" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Meta reel client", () => {
  it("sends REELS with caption and a custom cover over thumb offset", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "1789" }));
    await createReelContainer("tok", {
      videoUrl: VIDEO,
      caption: "Hola",
      coverUrl: "https://cdn.example.com/cover.jpg",
      thumbOffsetMs: 2000,
      shareToFeed: true,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/me\/media$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({
      media_type: "REELS",
      video_url: VIDEO,
      caption: "Hola",
      cover_url: "https://cdn.example.com/cover.jpg",
      share_to_feed: true,
    });
  });

  it("uses thumb_offset when there is no cover image", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "1789" }));
    await createReelContainer("tok", { videoUrl: VIDEO, thumbOffsetMs: 0 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      media_type: "REELS",
      video_url: VIDEO,
      thumb_offset: 0,
    });
  });

  it("still reports a publish when the permalink lookup fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "555" }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "boom", type: "x", code: 1 } }, 500)
      );
    await expect(publishMediaContainer("tok", "1789")).resolves.toEqual({
      id: "555",
    });
  });
});

describe("reel routes", () => {
  it("only accepts public https URLs", () => {
    expect(isPublicHttpsUrl(VIDEO)).toBe(true);
    expect(isPublicHttpsUrl("http://cdn.example.com/a.mp4")).toBe(false);
    expect(isPublicHttpsUrl("https://user:pw@cdn.example.com/a.mp4")).toBe(false);
    expect(isPublicHttpsUrl("not a url")).toBe(false);
  });

  it("creates a container for the requested account", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "1789" }));
    const res = await POST(
      postRequest("http://localhost/api/instagram/reels", {
        instagramAccountId: "acc_1",
        videoUrl: VIDEO,
        caption: "Hola",
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { containerId: "1789", username: "pink.trainer" },
    });
    expect(getAccount).toHaveBeenCalledWith("ws_1", "acc_1");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer plain-enc"
    );
  });

  it("requires an explicit account", async () => {
    const res = await POST(
      postRequest("http://localhost/api/instagram/reels", { videoUrl: VIDEO })
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects members without the Instagram accounts permission", async () => {
    getContext.mockResolvedValue({
      workspaceId: "ws_1",
      role: "MEMBER",
      permissions: [],
    });
    const res = await POST(
      postRequest("http://localhost/api/instagram/reels", {
        instagramAccountId: "acc_1",
        videoUrl: VIDEO,
      })
    );
    expect(res.status).toBe(403);
  });

  it("rejects an over-long caption without calling Meta", async () => {
    const res = await POST(
      postRequest("http://localhost/api/instagram/reels", {
        instagramAccountId: "acc_1",
        videoUrl: VIDEO,
        caption: "x".repeat(2201),
      })
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a missing publishing permission as 403", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: "Insufficient permission", type: "OAuth", code: 10 } },
        400
      )
    );
    const res = await POST(
      postRequest("http://localhost/api/instagram/reels", {
        instagramAccountId: "acc_1",
        videoUrl: VIDEO,
      })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/reconnect/);
  });

  it("reports container status", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: "1789", status_code: "IN_PROGRESS" })
    );
    const res = await GET(
      new NextRequest(
        "http://localhost/api/instagram/reels?instagramAccountId=acc_1&containerId=1789"
      )
    );
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { containerId: "1789", statusCode: "IN_PROGRESS", status: null },
    });
  });

  it("publishes a finished container", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "555" }))
      .mockResolvedValueOnce(
        jsonResponse({ permalink: "https://www.instagram.com/reel/abc/" })
      );
    const res = await PUBLISH(
      postRequest("http://localhost/api/instagram/reels/publish", {
        instagramAccountId: "acc_1",
        containerId: "1789",
      })
    );
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        mediaId: "555",
        permalink: "https://www.instagram.com/reel/abc/",
        username: "pink.trainer",
      },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      creation_id: "1789",
    });
  });
});
