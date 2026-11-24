import { NextRequest, NextResponse } from "next/server";
import { publishMediaContainer } from "@/lib/meta/client";
import {
  jsonError,
  metaErrorResponse,
  resolvePublishingAccount,
} from "@/lib/server/reel-publishing";

/**
 * Reel publishing, step 3: publish a container whose status is FINISHED.
 * See POST /api/instagram/reels for steps 1 and 2.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return jsonError("Invalid JSON body", 400);

  const resolved = await resolvePublishingAccount(body.instagramAccountId);
  if (!resolved.ok) return resolved.response;

  const { containerId } = body;
  if (typeof containerId !== "string" || !/^\d+$/.test(containerId)) {
    return jsonError("containerId is required", 400);
  }

  try {
    const media = await publishMediaContainer(resolved.accessToken, containerId);
    return NextResponse.json({
      success: true,
      data: {
        mediaId: media.id,
        permalink: media.permalink ?? null,
        username: resolved.username,
      },
    });
  } catch (err) {
    return metaErrorResponse(err, "Reels publish");
  }
}
