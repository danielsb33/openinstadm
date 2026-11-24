import { NextResponse } from "next/server";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  MetaApiError,
  PermissionError,
  RateLimitError,
  TokenExpiredError,
} from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  canManageInstagramAccounts,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

/** Instagram's caption limit. */
export const MAX_CAPTION_LENGTH = 2200;

export function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

/** Meta downloads the media itself, so it must be a public https URL. */
export function isPublicHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Resolve the caller's workspace, check they may manage Instagram accounts and
 * return the requested account's decrypted token, or an error response.
 */
export async function resolvePublishingAccount(
  instagramAccountId: unknown
): Promise<
  | { ok: true; accessToken: string; username: string }
  | { ok: false; response: NextResponse }
> {
  const context = await getCurrentWorkspaceContext();
  if (!context) return { ok: false, response: jsonError("Unauthorized", 401) };
  if (!canManageInstagramAccounts(context)) {
    return {
      ok: false,
      response: jsonError("You do not have permission to publish", 403),
    };
  }
  // An explicit account is required: publishing to "the latest connected
  // account" by default would be an easy way to post to the wrong profile.
  if (
    typeof instagramAccountId !== "string" ||
    !instagramAccountId ||
    instagramAccountId === "all"
  ) {
    return {
      ok: false,
      response: jsonError("instagramAccountId is required", 400),
    };
  }

  const account = await getWorkspaceInstagramAccount(
    context.workspaceId,
    instagramAccountId
  );
  if (!account) {
    return {
      ok: false,
      response: jsonError("Instagram account not found in this workspace", 404),
    };
  }

  return {
    ok: true,
    accessToken: decryptToken(account.accessToken),
    username: account.username,
  };
}

/** Turn a Meta failure into a response the agent (and a human) can act on. */
export function metaErrorResponse(err: unknown, logTag: string) {
  if (err instanceof TokenExpiredError) {
    return jsonError(
      "The Instagram token expired. Reconnect the account in OpenInstaDM.",
      401
    );
  }
  if (err instanceof PermissionError) {
    return jsonError(
      `Instagram refused the request: ${err.message}. If this is about permissions, reconnect the account so it grants content publishing.`,
      403
    );
  }
  if (err instanceof RateLimitError) {
    return jsonError(`Instagram rate limit reached: ${err.message}`, 429);
  }
  if (err instanceof MetaApiError) {
    return jsonError(`Instagram error: ${err.message}`, 502);
  }
  console.error(`[${logTag}] Error:`, err);
  return jsonError("Unexpected error while publishing", 500);
}
