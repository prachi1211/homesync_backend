import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/database";
import app from "./app";

const server = app.listen(env.PORT, () => {
  logger.info(`HomeSync API running on port ${env.PORT} [${env.NODE_ENV}]`);
});

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Server closed");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
