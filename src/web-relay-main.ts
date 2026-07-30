import { MotionDirectorWebRelay } from "./web-relay.js";

const publicBaseUrl =
  process.env.MOTION_PUBLIC_BASE_URL ?? process.env.RENDER_EXTERNAL_URL;

const relay = new MotionDirectorWebRelay({
  host: process.env.MOTION_RELAY_HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? process.env.MOTION_RELAY_PORT ?? "34719"),
  ...(publicBaseUrl ? { publicBaseUrl } : {}),
});

await relay.start();
console.error(`Motion Director Web relay listening at ${relay.publicBaseUrl}`);

const shutdown = async () => {
  await relay.stop();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
