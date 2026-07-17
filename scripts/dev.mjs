import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = resolve(root, "node_modules/tsdown/dist/run.mjs");
const arguments_ = process.argv.slice(2);
const option = (name, fallback) => {
  const index = arguments_.indexOf(name);
  return index === -1 ? fallback : arguments_[index + 1];
};
const port = Number(option("--port", "4173"));
const shouldOpen = !arguments_.includes("--no-open");
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
  throw new RangeError("--port must be an integer from 1 to 65535");

const compiler = spawn(process.execPath, [cli, "--watch"], {
  cwd: root,
  stdio: "inherit",
});
for (const attempt of Array(201).keys()) {
  try {
    await access(resolve(root, "dist/index.mjs"));
    break;
  } catch {
    if (compiler.exitCode !== null)
      throw new Error(`the compiler exited with ${compiler.exitCode}`);
    if (attempt === 200) throw new Error("the first build did not finish");
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
}
const clients = new Set();
let reloadTimer;
const watcher = watch(resolve(root, "dist"), { recursive: true }, () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    for (const client of clients) client.write("event: reload\ndata: now\n\n");
  }, 80);
});

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
]);
const reloadClient = `<script>
  const source = new EventSource("/__flowers_reload");
  source.addEventListener("reload", () => location.reload());
</script>`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/__flowers_reload") {
      response.writeHead(200, {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      });
      response.write("retry: 500\n\n");
      clients.add(response);
      request.once("close", () => clients.delete(response));
      return;
    }
    const pathname = decodeURIComponent(
      url.pathname === "/" ? "/workbench.html" : url.pathname
    );
    const file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${sep}`))
      throw new Error("path is outside the project");
    const extension = extname(file);
    let body = await readFile(file);
    if (extension === ".html")
      body = Buffer.from(
        body.toString().replace("</body>", `${reloadClient}</body>`)
      );
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": mime.get(extension) ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(port, "127.0.0.1", resolveListen);
});
const url = `http://127.0.0.1:${port}/workbench.html`;
console.log(`\nFlower lab: ${url}\n`);

if (shouldOpen) {
  const command =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(command[0], command[1], { detached: true, stdio: "ignore" }).unref();
}

let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  clearTimeout(reloadTimer);
  watcher.close();
  compiler.kill("SIGTERM");
  for (const client of clients) client.end();
  server.close(() => process.exit(0));
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
compiler.once("exit", (code) => {
  if (!closing && code && code !== 0) {
    server.close();
    process.exit(code);
  }
});
