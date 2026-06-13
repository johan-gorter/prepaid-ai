import { onRequest, type Request } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import sharp from "sharp";
import { bucket, db } from "./admin.js";
import { storagePathFromUrl } from "./utils.js";

// ---------------------------------------------------------------------------
// Share link OG cards + public tokenized image endpoint (issue #92).
//
// `/share/<token>`            -> shareOg   : minimal HTML with Open Graph tags
//                                            so link crawlers (WhatsApp,
//                                            iMessage, Slack, X) render a rich
//                                            card. Human browsers run the
//                                            inline script and are handed off
//                                            to the SPA viewer at `/s/<token>`.
// `/share/<token>/image.webp` -> shareImage: the result image re-rendered to a
//                                            1024x1024 WebP, served publicly so
//                                            crawlers (which never authenticate
//                                            to Firebase Storage) can fetch it.
//
// These two functions are pinned to a FIXED region (not the per-environment
// FUNCTIONS_REGION) so the static `firebase.json` hosting rewrite can name a
// single region across sandbox/dev/production. They only do Admin-SDK
// Firestore + Storage reads, so cross-region latency is the only cost.
// ---------------------------------------------------------------------------
const SHARE_REGION = "europe-west4";

const OG_IMAGE_SIZE = 1024;

// Share tokens are 32 lowercase hex chars (see createOrGetShareToken on the
// client). Validating before echoing the token into HTML/redirect URLs keeps
// untrusted path input out of the response.
const TOKEN_RE = /^[a-f0-9]{32}$/;

interface ShareDoc {
  ownerUid?: string;
  resultImageUrl?: string;
  locale?: string;
}

// Sober, no assumptions about what the photo shows (it may not be a room).
// Localized by the sharer's stored locale; English is the fallback.
const OG_COPY: Record<string, { title: string; description: string }> = {
  nl: {
    title: "Gemaakt met AI op payasyougo.app",
    description: "Bekijk de impressie op payasyougo.app.",
  },
  en: {
    title: "Made with AI on payasyougo.app",
    description: "View the impression on payasyougo.app.",
  },
};

function copyFor(locale: string | undefined) {
  return locale && OG_COPY[locale] ? OG_COPY[locale] : OG_COPY.en;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Reconstruct the public site origin from the (hosting-proxied) request. */
function baseUrl(req: Request): string {
  const host = req.get("host") ?? "payasyougo.app";
  const forwarded = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwarded === "string"
      ? forwarded.split(",")[0].trim()
      : host.startsWith("localhost") || host.startsWith("127.")
        ? "http"
        : "https";
  return `${proto}://${host}`;
}

/** Pull the share token out of the rewritten request path. */
function tokenFromPath(path: string): string | undefined {
  // path is like "/share/<token>" or "/share/<token>/image.webp"
  const parts = path.split("/").filter(Boolean);
  return parts[0] === "share" ? parts[1] : undefined;
}

async function loadShare(token: string): Promise<ShareDoc | null> {
  const snap = await db.doc(`shares/${token}`).get();
  return snap.exists ? (snap.data() as ShareDoc) : null;
}

function ogHtml(opts: {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  spaPath: string;
}): string {
  const { title, description, url, imageUrl, spaPath } = opts;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  const imageTags = imageUrl
    ? `
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="${OG_IMAGE_SIZE}" />
    <meta property="og:image:height" content="${OG_IMAGE_SIZE}" />
    <meta property="og:image:type" content="image/webp" />
    <meta name="twitter:card" content="summary_large_image" />`
    : `
    <meta name="twitter:card" content="summary" />`;
  // Crawlers do not run JS, so they keep this OG page. Human browsers run the
  // inline replace and land on the SPA share viewer; <noscript> covers the
  // JS-disabled human.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${u}" />
    <meta property="og:type" content="website" />${imageTags}
    <title>${t}</title>
    <script>location.replace(${JSON.stringify(spaPath)});</script>
    <meta name="robots" content="noindex" />
  </head>
  <body>
    <p>${d}</p>
    <noscript><a href="${escapeHtml(spaPath)}">payasyougo.app</a></noscript>
  </body>
</html>`;
}

export const shareOg = onRequest({ region: SHARE_REGION }, async (req, res) => {
  const base = baseUrl(req);
  const token = tokenFromPath(req.path);
  const valid = token && TOKEN_RE.test(token);

  // Where to hand off human visitors. A valid token goes to the SPA viewer
  // (`/s/<token>`); anything else (missing/garbage token) to the gallery.
  const spaPath = valid ? `/s/${token}` : "/renovations";

  let share: ShareDoc | null = null;
  if (valid) {
    try {
      share = await loadShare(token);
    } catch (err) {
      logger.error("shareOg: failed to load share doc", {
        token,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const { title, description } = copyFor(share?.locale);
  const html = ogHtml({
    title,
    description,
    url: `${base}/share/${valid ? token : ""}`,
    // Unknown/expired tokens get generic OG tags without an image.
    imageUrl: share ? `${base}/share/${token}/image.webp` : undefined,
    spaPath,
  });

  res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    // Short cache: the underlying image is immutable, but the OG copy can
    // change on redeploy.
    .set("Cache-Control", "public, max-age=600")
    .send(html);
});

export const shareImage = onRequest(
  { region: SHARE_REGION },
  async (req, res) => {
    const token = tokenFromPath(req.path);
    if (!token || !TOKEN_RE.test(token)) {
      res.status(404).send("Not found");
      return;
    }

    let share: ShareDoc | null;
    try {
      share = await loadShare(token);
    } catch (err) {
      logger.error("shareImage: failed to load share doc", {
        token,
        message: err instanceof Error ? err.message : String(err),
      });
      res.status(500).send("Internal error");
      return;
    }

    if (!share?.resultImageUrl) {
      res.status(404).send("Not found");
      return;
    }

    let resized: Buffer;
    try {
      const path = storagePathFromUrl(share.resultImageUrl);
      const [buffer] = await bucket.file(path).download();
      resized = Buffer.from(
        await sharp(buffer)
          .resize(OG_IMAGE_SIZE, OG_IMAGE_SIZE, { fit: "cover" })
          .webp({ quality: 80 })
          .toBuffer(),
      );
    } catch (err) {
      logger.error("shareImage: failed to render image", {
        token,
        message: err instanceof Error ? err.message : String(err),
      });
      res.status(404).send("Not found");
      return;
    }

    res
      .status(200)
      .set("Content-Type", "image/webp")
      // Token + underlying image are immutable, so cache hard.
      .set("Cache-Control", "public, max-age=31536000, immutable")
      .send(resized);
  },
);
