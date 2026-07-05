import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options
  });
  return child;
}

function runAndWait(command, args) {
  return new Promise((resolve, reject) => {
    const child = run(command, args);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

await runAndWait("npm", ["run", "build:core"]);

const server = run("node", [
  "apps/web-local-server/server.mjs",
  "--root",
  "sample-project",
  "--port",
  "4317"
]);

const viteBin = process.platform === "win32" ? "node_modules/.bin/vite.cmd" : "node_modules/.bin/vite";
const web = run(viteBin, [
  "--config",
  "apps/web/vite.config.ts",
  "--host",
  "127.0.0.1",
  "--port",
  "5173"
]);

function stopAll() {
  server.kill("SIGTERM");
  web.kill("SIGTERM");
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

await Promise.race([
  new Promise((resolve) => server.on("exit", resolve)),
  new Promise((resolve) => web.on("exit", resolve))
]);

stopAll();
