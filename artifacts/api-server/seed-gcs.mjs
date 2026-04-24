/**
 * One-time seed script: uploads Mushaf asset ZIPs to GCS via Replit sidecar signed URLs.
 * Run from the workspace root with: node artifacts/api-server/seed-gcs.mjs
 */
import { createReadStream, statSync, existsSync } from "fs";
import https from "https";
import http from "http";
import { URL } from "url";

const SIDECAR = "http://127.0.0.1:1106";
const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
if (!BUCKET_ID) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");

async function getSignedUrl(objectName) {
  const body = JSON.stringify({
    bucket_name: BUCKET_ID,
    object_name: objectName,
    method: "PUT",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  const res = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Sidecar signed-url failed (${res.status}): ${txt}`);
  }
  const { signed_url } = await res.json();
  return signed_url;
}

async function checkExists(objectName) {
  const token = await fetch(`${SIDECAR}/credential`).then(r => r.json());
  const url = `https://storage.googleapis.com/${BUCKET_ID}/${objectName}`;
  const res = await fetch(url, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  return res.ok;
}

function uploadViaPut(localPath, signedUrl) {
  return new Promise((resolve, reject) => {
    const fileSize = statSync(localPath).size;
    const parsed = new URL(signedUrl);
    const lib = parsed.protocol === "https:" ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "PUT",
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": fileSize,
      },
    };

    const req = lib.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`GCS PUT failed: HTTP ${res.statusCode} — ${body}`));
        }
      });
    });

    req.on("error", reject);

    let uploaded = 0;
    const stream = createReadStream(localPath);
    stream.on("data", (chunk) => {
      uploaded += chunk.length;
      const pct = ((uploaded / fileSize) * 100).toFixed(1);
      process.stdout.write(`\r  ${pct}% (${(uploaded / 1e6).toFixed(1)} MB / ${(fileSize / 1e6).toFixed(1)} MB)`);
    });
    stream.on("end", () => process.stdout.write("\n"));
    stream.pipe(req);
  });
}

const assets = [
  {
    localPath: "/home/runner/workspace/attached_assets/ligature-basd-svg_1776916961528.zip",
    objectName: "assets/mushaf-svgs.zip",
    label: "mushaf-svgs",
  },
  {
    localPath: "/home/runner/workspace/attached_assets/QPC_V2_Font_1776923770512.ttf",
    objectName: "assets/qpc-v2-fonts.zip",
    label: "qpc-fonts",
  },
];

for (const { localPath, objectName, label } of assets) {
  if (!existsSync(localPath)) {
    console.error(`✗ Source file not found: ${localPath}`);
    process.exit(1);
  }

  process.stdout.write(`Checking GCS for ${label}… `);
  const exists = await checkExists(objectName);
  if (exists) {
    console.log("already uploaded, skipping.");
    continue;
  }
  console.log("not found, uploading.");

  const signedUrl = await getSignedUrl(objectName);
  console.log(`Uploading ${label} (${(statSync(localPath).size / 1e6).toFixed(0)} MB)…`);
  const t0 = Date.now();
  await uploadViaPut(localPath, signedUrl);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✓ ${label} uploaded in ${elapsed}s`);
  console.log(`  gs://${BUCKET_ID}/${objectName}`);
}

console.log(`\nGCS bucket: ${BUCKET_ID}`);
console.log("Assets seeded. The API server will download from object storage when local files are absent.");
