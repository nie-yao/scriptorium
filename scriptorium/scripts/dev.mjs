import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiPort = process.env.SCRIPTORIUM_API_PORT ?? "4317";
const webPort = process.env.SCRIPTORIUM_WEB_PORT ?? "5173";

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options
  });
  child.on("error", (error) => {
    console.error(`${command} failed to start: ${error.message}`);
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

assertCommand("cargo", "Rust backend selected, but cargo was not found. Install Rust from https://rustup.rs/ and retry.");
const server = run("cargo", ["run", "-p", "scriptorium-local-server", "--", "--root", "sample-project", "--port", apiPort]);

const viteBin = process.platform === "win32" ? "node_modules/.bin/vite.cmd" : "node_modules/.bin/vite";
const web = run(viteBin, [
  "--config",
  "apps/web/vite.config.ts",
  "--host",
  "127.0.0.1",
  "--port",
  webPort
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

function assertCommand(command, message) {
  const result = spawnSync(command, ["--version"], {
    cwd: root,
    stdio: "ignore",
    shell: process.platform === "win32"
  });
  if (result.error || result.status !== 0) {
    throw new Error(message);
  }
}
