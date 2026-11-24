import { NextRequest, NextResponse } from "next/server";
import {
  createReelContainer,
  getMediaContainerStatus,
} from "@/lib/meta/client";
import {
  isPublicHttpsUrl,
  jsonError,
  MAX_CAPTION_LENGTH,
  metaErrorResponse,
  resolvePublishingAccount,
} from "@/lib/server/reel-publishing";

/**
 * Reel publishing, steps 1 and 2.
 *
 * POST creates a Reel container from a public video URL; Meta then downloads
 * and processes the video. Poll GET until `statusCode` is FINISHED, then call
 * POST /api/instagram/reels/publish. The video URL must stay reachable until
 * processing finishes.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return jsonError("Invalid JSON body", 400);

  const resolved = await resolvePublishingAccount(body.instagramAccountId);
  if (!resolved.ok) return resolved.response;

  const { videoUrl, caption, coverUrl, thumbOffsetMs, shareToFeed } = body;
  if (!isPublicHttpsUrl(videoUrl)) {
    return jsonError("videoUrl must be a public https URL", 400);
  }
  if (caption !== undefined && typeof caption !== "string") {
    return jsonError("caption must be a string", 400);
  }
  if (typeof caption === "string" && caption.length > MAX_CAPTION_LENGTH) {
    return jsonError(
      `caption is longer than ${MAX_CAPTION_LENGTH} characters`,
      400
    );
  }
  if (coverUrl !== undefined && !isPublicHttpsUrl(coverUrl)) {
    return jsonError("coverUrl must be a public https URL", 400);
  }
  if (
    thumbOffsetMs !== undefined &&
    (typeof thumbOffsetMs !== "number" ||
      !Number.isInteger(thumbOffsetMs) ||
      thumbOffsetMs < 0)
  ) {
    return jsonError("thumbOffsetMs must be a non-negative integer", 400);
  }
  if (shareToFeed !== undefined && typeof shareToFeed !== "boolean") {
    return jsonError("shareToFeed must be a boolean", 400);
  }

  try {
    const container = await createReelContainer(resolved.accessToken, {
      videoUrl,
      caption: caption as string | undefined,
      coverUrl: coverUrl as string | undefined,
      thumbOffsetMs: thumbOffsetMs as number | undefined,
      shareToFeed: shareToFeed as boolean | undefined,
    });
    return NextResponse.json({
      success: true,
      data: { containerId: container.id, username: resolved.username },
    });
  } catch (err) {
    return metaErrorResponse(err, "Reels create");
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const resolved = await resolvePublishingAccount(
    params.get("instagramAccountId")
  );
  if (!resolved.ok) return resolved.response;

  const containerId = params.get("containerId");
  if (!containerId || !/^\d+$/.test(containerId)) {
    return jsonError("containerId is required", 400);
  }

  try {
    const status = await getMediaContainerStatus(
      resolved.accessToken,
      containerId
    );
    return NextResponse.json({
      success: true,
      data: {
        containerId: status.id,
        statusCode: status.status_code,
        status: status.status ?? null,
      },
    });
  } catch (err) {
    return metaErrorResponse(err, "Reels status");
  }
}
