import { MotionDirectorWebRelay } from "./web-relay.js";

const publicBaseUrl =
  process.env.MOTION_PUBLIC_BASE_URL ?? process.env.RENDER_EXTERNAL_URL;
const developerInstallationIds = (
  process.env.MOTION_KNOWLEDGE_DEVELOPER_INSTALLATIONS ?? ""
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const relay = new MotionDirectorWebRelay({
  host: process.env.MOTION_RELAY_HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? process.env.MOTION_RELAY_PORT ?? "34719"),
  ...(publicBaseUrl ? { publicBaseUrl } : {}),
  ...(process.env.MOTION_KNOWLEDGE_PATH
    ? { knowledgeFilePath: process.env.MOTION_KNOWLEDGE_PATH }
    : {}),
  ...(process.env.MOTION_KNOWLEDGE_REDIS_URL
    ? { knowledgeRedisUrl: process.env.MOTION_KNOWLEDGE_REDIS_URL }
    : {}),
  ...(process.env.MOTION_KNOWLEDGE_REDIS_TOKEN
    ? { knowledgeRedisToken: process.env.MOTION_KNOWLEDGE_REDIS_TOKEN }
    : {}),
  ...(process.env.MOTION_KNOWLEDGE_REDIS_KEY
    ? { knowledgeRedisKey: process.env.MOTION_KNOWLEDGE_REDIS_KEY }
    : {}),
  developerInstallationIds,
});

await relay.start();
console.error(`Motion Director Web relay listening at ${relay.publicBaseUrl}`);

const shutdown = async () => {
  await relay.stop();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
