import { Router } from "express";
import { openSync, readSync, fstatSync } from "fs";
import { inflateRawSync } from "zlib";
import path from "path";

const router = Router();

const ZIP_PATH = path.resolve(
  process.cwd(),
  "..",
  "..",
  "attached_assets",
  "ligature-basd-svg_1776916961528.zip"
);

interface ZipEntry {
  compMethod: number;
  compSize: number;
  uncompSize: number;
  localOffset: number;
}

const zipEntries = new Map<string, ZipEntry>();
const svgCache = new Map<number, string>();
let zipFd = -1;
let initError: string | null = null;

function readAt(buf: Buffer, fileOffset: number, length: number): void {
  readSync(zipFd, buf, 0, length, fileOffset);
}

function init(): void {
  try {
    zipFd = openSync(ZIP_PATH, "r");
    const { size } = fstatSync(zipFd);

    const searchLen = Math.min(65_557, size);
    const searchBuf = Buffer.allocUnsafe(searchLen);
    readSync(zipFd, searchBuf, 0, searchLen, size - searchLen);

    let eocdPos = -1;
    for (let i = searchLen - 22; i >= 0; i--) {
      if (
        searchBuf[i] === 0x50 &&
        searchBuf[i + 1] === 0x4b &&
        searchBuf[i + 2] === 0x05 &&
        searchBuf[i + 3] === 0x06
      ) {
        eocdPos = i;
        break;
      }
    }
    if (eocdPos < 0) throw new Error("EOCD record not found in ZIP");

    const numEntries = searchBuf.readUInt16LE(eocdPos + 10);
    const cdOffset = searchBuf.readUInt32LE(eocdPos + 16);
    const cdSize = searchBuf.readUInt32LE(eocdPos + 12);

    const cdBuf = Buffer.allocUnsafe(cdSize);
    readSync(zipFd, cdBuf, 0, cdSize, cdOffset);

    let pos = 0;
    for (let i = 0; i < numEntries; i++) {
      if (cdBuf.readUInt32LE(pos) !== 0x02014b50) break;
      const compMethod = cdBuf.readUInt16LE(pos + 10);
      const compSize = cdBuf.readUInt32LE(pos + 20);
      const uncompSize = cdBuf.readUInt32LE(pos + 24);
      const fnLen = cdBuf.readUInt16LE(pos + 28);
      const extraLen = cdBuf.readUInt16LE(pos + 30);
      const commentLen = cdBuf.readUInt16LE(pos + 32);
      const localOffset = cdBuf.readUInt32LE(pos + 42);
      const fn = cdBuf.subarray(pos + 46, pos + 46 + fnLen).toString("utf8");

      if (fn.startsWith("ligature-basd-svg/") && fn.endsWith(".svg")) {
        const basename = fn.replace("ligature-basd-svg/", "");
        zipEntries.set(basename, { compMethod, compSize, uncompSize, localOffset });
      }

      pos += 46 + fnLen + extraLen + commentLen;
    }

    console.log(
      `[mushaf-svg] Loaded ZIP directory: ${zipEntries.size} SVG pages indexed`
    );
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
    console.error("[mushaf-svg] Failed to initialise ZIP:", initError);
  }
}

function extractSvg(pageNum: number): string {
  if (svgCache.has(pageNum)) return svgCache.get(pageNum)!;

  const filename = String(pageNum).padStart(3, "0") + ".svg";
  const entry = zipEntries.get(filename);
  if (!entry) throw new Error(`No ZIP entry for page ${pageNum} (${filename})`);

  const localHeaderBuf = Buffer.allocUnsafe(30);
  readAt(localHeaderBuf, entry.localOffset, 30);
  const fnLen = localHeaderBuf.readUInt16LE(26);
  const extLen = localHeaderBuf.readUInt16LE(28);
  const dataStart = entry.localOffset + 30 + fnLen + extLen;

  const compData = Buffer.allocUnsafe(entry.compSize);
  readAt(compData, dataStart, entry.compSize);

  const svgBuf =
    entry.compMethod === 0 ? compData : inflateRawSync(compData);
  const svgStr = svgBuf.toString("utf8");
  svgCache.set(pageNum, svgStr);
  return svgStr;
}

init();

router.get("/mushaf-svg/:page", (req, res) => {
  if (initError) {
    res.status(503).json({ error: `SVG service unavailable: ${initError}` });
    return;
  }

  const pageNum = parseInt(req.params.page, 10);
  if (isNaN(pageNum) || pageNum < 1 || pageNum > 604) {
    res.status(400).json({ error: "Page must be an integer 1–604" });
    return;
  }

  try {
    const svg = extractSvg(pageNum);
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(svg);
  } catch (err) {
    console.error(`[mushaf-svg] Extraction failed for page ${pageNum}:`, err);
    res.status(500).json({ error: "Failed to extract SVG for this page" });
  }
});

export default router;
