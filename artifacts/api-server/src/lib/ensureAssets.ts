import { Storage } from "@google-cloud/storage";
import { existsSync, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import path from "path";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT ?? path.resolve(process.cwd(), "..", "..");

const SVG_LOCAL_PATH = path.join(
  WORKSPACE_ROOT,
  "attached_assets",
  "ligature-basd-svg_1776916961528.zip"
);

const FONT_LOCAL_PATH = path.join(
  WORKSPACE_ROOT,
  "attached_assets",
  "QPC_V2_Font_1776923770512.ttf"
);

const SVG_TMP_PATH = "/tmp/mushaf-svgs.zip";
const FONT_TMP_PATH = "/tmp/qpc-v2-fonts.zip";
const SVG_OBJECT_NAME = "assets/mushaf-svgs.zip";
const FONT_OBJECT_NAME = "assets/qpc-v2-fonts.zip";

function createStorage(): Storage {
  return new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: {
          type: "json",
          subject_token_field_name: "access_token",
        },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  } as ConstructorParameters<typeof Storage>[0]);
}

type GcsFile = ReturnType<ReturnType<Storage["bucket"]>["file"]>;

async function downloadFromGcs(file: GcsFile, destPath: string): Promise<void> {
  await pipeline(file.createReadStream(), createWriteStream(destPath));
}

async function ensureGcsDownload(
  storage: Storage,
  bucketId: string,
  objectName: string,
  tmpPath: string,
  label: string
): Promise<string> {
  if (existsSync(tmpPath)) {
    console.log(`[assets] ${label} already cached at ${tmpPath}`);
    return tmpPath;
  }

  const file = storage.bucket(bucketId).file(objectName);
  const [gcsExists] = await file.exists();
  if (!gcsExists) {
    throw new Error(
      `[assets] ${label} not found in object storage ` +
      `(bucket=${bucketId}, object=${objectName}). ` +
      `Run: node artifacts/api-server/seed-gcs.mjs  to upload assets.`
    );
  }

  console.log(`[assets] Downloading ${label} from object storage to ${tmpPath}…`);
  const t0 = Date.now();
  await downloadFromGcs(file, tmpPath);
  console.log(`[assets] Downloaded ${label} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return tmpPath;
}

export async function ensureAssets(): Promise<{
  svgZipPath: string;
  fontZipPath: string;
}> {
  if (existsSync(SVG_LOCAL_PATH) && existsSync(FONT_LOCAL_PATH)) {
    console.log("[assets] Local asset files found — using them directly");
    return { svgZipPath: SVG_LOCAL_PATH, fontZipPath: FONT_LOCAL_PATH };
  }

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error(
      "[assets] Local asset files are missing and DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set. " +
      "Ensure object storage is provisioned and assets are seeded."
    );
  }

  console.log("[assets] Local files not found — fetching from object storage…");
  const storage = createStorage();

  const [svgZipPath, fontZipPath] = await Promise.all([
    ensureGcsDownload(storage, bucketId, SVG_OBJECT_NAME, SVG_TMP_PATH, "mushaf-svgs"),
    ensureGcsDownload(storage, bucketId, FONT_OBJECT_NAME, FONT_TMP_PATH, "qpc-fonts"),
  ]);

  return { svgZipPath, fontZipPath };
}
