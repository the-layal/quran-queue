import app from "./app";
import { logger } from "./lib/logger";
import { ensureAssets } from "./lib/ensureAssets";
import { initSvgRoute } from "./routes/mushafSvg";
import { initFontRoute } from "./routes/qpcFont";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

logger.info("Ensuring Mushaf assets are available…");
const { svgZipPath, fontZipPath } = await ensureAssets();

await Promise.all([initSvgRoute(svgZipPath), initFontRoute(fontZipPath)]);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
