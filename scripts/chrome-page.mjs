import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export function chromeExecutable(purpose = "browser automation") {
  const candidates = [
    process.env.CHROME_PATH,
    "google-chrome",
    "chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (
      candidate.includes(sep)
        ? existsSync(candidate)
        : spawnSync(candidate, ["--version"]).status === 0
    )
      return candidate;
  }
  throw new Error(
    `Chrome or Chromium is required for ${purpose}; set CHROME_PATH to its executable`
  );
}

const POLL_INTERVAL = 25;
const STARTUP_TIMEOUT = 30_000;

async function activePort(profile, child, timeout) {
  const file = join(profile, "DevToolsActivePort");
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Chrome exited with ${child.exitCode} before starting`);
    try {
      const [value] = (await readFile(file, "utf8")).split("\n");
      const port = Number(value);
      if (Number.isSafeInteger(port) && port > 0) return port;
    } catch {}
    await delay(POLL_INTERVAL);
  }
  throw new Error("Chrome did not publish its DevTools port");
}

async function pageSocket(port, expectedUrl, child, timeout) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Chrome exited with ${child.exitCode} before loading`);
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
        (response) => response.json()
      );
      const page = targets.find(
        (target) => target.type === "page" && target.url.startsWith(expectedUrl)
      );
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await delay(POLL_INTERVAL);
  }
  throw new Error("Chrome did not create the requested page");
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const rejectPending = (reason) => {
    const error =
      reason instanceof Error
        ? reason
        : new Error("Chrome DevTools disconnected");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  socket.addEventListener("close", () => rejectPending());
  socket.addEventListener("error", (event) =>
    rejectPending(event.error ?? new Error("Chrome DevTools socket failed"))
  );
  return Object.freeze({
    close: () => socket.close(),
    send(method, params = {}) {
      if (socket.readyState !== WebSocket.OPEN)
        return Promise.reject(new Error("Chrome DevTools is not connected"));
      sequence += 1;
      const id = sequence;
      return new Promise((resolveRequest, rejectRequest) => {
        pending.set(id, { reject: rejectRequest, resolve: resolveRequest });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  });
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails)
    throw new Error(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text ??
        "browser evaluation failed"
    );
  return response.result.value;
}

export async function runChromePage({
  chrome = chromeExecutable(),
  chromeArguments = [],
  expression = "document.documentElement.outerHTML",
  progressExpression = "document.title",
  readyExpression = 'document.title === "ready"',
  screenshot,
  timeout = 60_000,
  url,
  viewport,
}) {
  if (!url) throw new TypeError("runChromePage needs a URL");
  const profile = await mkdtemp(join(tmpdir(), "flowers-chrome-"));
  let child;
  let client;
  let stderr = "";
  try {
    child = spawn(
      chrome,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-sync",
        "--metrics-recording-only",
        "--no-first-run",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        ...chromeArguments,
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-16_000);
    });
    const startupTimeout = Math.min(timeout, STARTUP_TIMEOUT);
    const port = await activePort(profile, child, startupTimeout);
    client = await connect(
      await pageSocket(port, "about:blank", child, startupTimeout)
    );
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    if (viewport)
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 1,
        height: viewport.height,
        mobile: false,
        width: viewport.width,
      });
    await client.send("Page.navigate", { url });

    const deadline = performance.now() + timeout;
    while (!(await evaluate(client, readyExpression))) {
      if (child.exitCode !== null)
        throw new Error(`Chrome exited with ${child.exitCode} while rendering`);
      if (performance.now() > deadline) {
        const progress = await evaluate(client, progressExpression);
        throw new Error(`Chrome page timed out at ${String(progress)}`);
      }
      await delay(POLL_INTERVAL);
    }
    const result = await evaluate(client, expression);
    if (screenshot) {
      const capture = await client.send("Page.captureScreenshot", {
        captureBeyondViewport: false,
        format: "png",
        fromSurface: true,
        optimizeForSpeed: true,
      });
      await writeFile(screenshot, capture.data, "base64");
    }
    return { result, stderr };
  } catch (error) {
    if (stderr) error.message = `${error.message}\n${stderr}`;
    throw error;
  } finally {
    client?.close();
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolveExit) => child.once("close", resolveExit)),
        delay(2_000),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    await rm(profile, { force: true, recursive: true });
  }
}
