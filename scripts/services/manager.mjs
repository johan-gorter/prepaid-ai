import { execSync, spawn } from "node:child_process";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { Transform } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { ERROR_PATTERNS, LOGS_DIR, REPO_ROOT, services } from "./registry.mjs";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

function buildPath(cwd) {
  const separator = process.platform === "win32" ? ";" : ":";
  const dirs = [join(REPO_ROOT, "node_modules", ".bin")];
  if (cwd) {
    const localBin = join(cwd, "node_modules", ".bin");
    if (!dirs.includes(localBin)) {
      dirs.unshift(localBin);
    }
  }
  return `${dirs.join(separator)}${separator}${process.env.PATH ?? ""}`;
}

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function pidFile(name) {
  return join(LOGS_DIR, `${encodeURIComponent(name)}.pid`);
}

function logFile(name) {
  return join(LOGS_DIR, `${encodeURIComponent(name)}.log`);
}

function hasLog(name) {
  const filePath = logFile(name);
  return existsSync(filePath) && statSync(filePath).size > 0;
}

function readPid(name) {
  const filePath = pidFile(name);
  if (!existsSync(filePath)) return null;
  const pid = Number.parseInt(readFileSync(filePath, "utf-8").trim(), 10);
  return Number.isNaN(pid) ? null : pid;
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function readLastLine(filePath, mapper) {
  if (!existsSync(filePath)) return "";

  try {
    const stats = statSync(filePath);
    if (stats.size === 0) return "";

    const size = Math.min(stats.size, 4096);
    const buffer = Buffer.alloc(size);
    const fd = openSync(filePath, "r");
    readSync(fd, buffer, 0, size, stats.size - size);
    closeSync(fd);

    const lines = buffer
      .toString("utf-8")
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean);

    if (!mapper) {
      return lines.at(-1) ?? "";
    }

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const mapped = mapper(stripAnsi(lines[index]));
      if (mapped !== undefined) {
        return mapped;
      }
    }

    return lines.at(-1) ?? "";
  } catch {
    return "";
  }
}

function countErrors(name, type) {
  const filePath = logFile(name);
  if (!existsSync(filePath)) return 0;

  try {
    const pattern = ERROR_PATTERNS[type] ?? ERROR_PATTERNS.node;
    return readFileSync(filePath, "utf-8")
      .split("\n")
      .reduce(
        (count, line) => count + (pattern.test(stripAnsi(line)) ? 1 : 0),
        0,
      );
  } catch {
    return 0;
  }
}

export function discoverRunning() {
  if (!existsSync(LOGS_DIR)) return [];

  return readdirSync(LOGS_DIR)
    .filter((fileName) => fileName.endsWith(".pid"))
    .map((fileName) => decodeURIComponent(fileName.replace(/\.pid$/, "")));
}

export function start(name) {
  const service = services[name];
  if (!service) {
    console.error(`Unknown service: ${name}`);
    return false;
  }

  const existingPid = readPid(name);
  if (existingPid && isRunning(existingPid)) {
    console.log(`  ${name} is already running (PID ${existingPid}).`);
    return false;
  }

  const pidPath = pidFile(name);
  if (existsSync(pidPath)) {
    unlinkSync(pidPath);
  }

  ensureLogsDir();

  const logPath = logFile(name);
  if (existsSync(logPath)) {
    unlinkSync(logPath);
  }

  const scriptPath = join(THIS_DIR, "manager.mjs");
  let pid;

  if (process.platform === "win32" && service.shell) {
    const escapeSingleQuotes = (value) => value.replace(/'/g, "''");
    const commandLine = [service.command, ...service.args].join(" ");
    const output = execSync(
      `powershell -NoProfile -Command "$env:FORCE_COLOR='0'; $env:PATH='${escapeSingleQuotes(buildPath(service.cwd))}'; (Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/s','/c','${escapeSingleQuotes(`${commandLine} >> \"${logPath}\" 2>&1`)}' -WorkingDirectory '${escapeSingleQuotes(service.cwd)}' -WindowStyle Hidden -PassThru).Id"`,
      { encoding: "utf-8" },
    );
    pid = Number.parseInt(output.trim(), 10);
  } else if (process.platform === "win32") {
    const escapeSingleQuotes = (value) => value.replace(/'/g, "''");
    const output = execSync(
      `powershell -NoProfile -Command "(Start-Process -FilePath node -ArgumentList '${escapeSingleQuotes(scriptPath)}','_run','${escapeSingleQuotes(name)}' -WorkingDirectory '${escapeSingleQuotes(service.cwd)}' -WindowStyle Hidden -PassThru).Id"`,
      { encoding: "utf-8" },
    );
    pid = Number.parseInt(output.trim(), 10);
  } else {
    const child = spawn("node", [scriptPath, "_run", name], {
      cwd: service.cwd,
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    pid = child.pid;
  }

  writeFileSync(pidPath, String(pid), "utf-8");
  console.log(`  ${name} started. Log: ${logPath}`);
  return true;
}

function canConnect(port, host = "localhost") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });

    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function waitForServices(names, timeoutMs = 45_000) {
  const pending = new Map();

  for (const name of names) {
    const service = services[name];
    if (!service) {
      throw new Error(`Unknown service: ${name}`);
    }

    if (!service.port) {
      continue;
    }

    pending.set(name, service.port);
  }

  if (pending.size === 0) {
    return;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const [name, port] of [...pending.entries()]) {
      const ready = await canConnect(port, services[name]?.waitHost);
      if (ready) {
        pending.delete(name);
      }
    }

    if (pending.size === 0) {
      return;
    }

    await sleep(500);
  }

  const unresponsive = [...pending.keys()].join(", ");
  throw new Error(`Unresponsive services after 45s: ${unresponsive}`);
}

export async function stop(name) {
  const pid = readPid(name);

  if (pid && isRunning(pid)) {
    console.log(`  Stopping ${name} (PID ${pid})...`);
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
      } else {
        process.kill(-pid, "SIGTERM");
      }
    } catch {
      // Best effort; process may have already exited.
    }

    let tries = 10;
    while (tries > 0 && isRunning(pid)) {
      tries -= 1;
      await sleep(500);
    }

    if (isRunning(pid)) {
      console.error(`  Warning: ${name} (PID ${pid}) may still be running.`);
    } else {
      console.log(`  ${name} stopped.`);
    }
  } else if (pid) {
    console.log(`  ${name} is not running (stale PID ${pid}).`);
  }

  const pidPath = pidFile(name);
  if (existsSync(pidPath)) {
    unlinkSync(pidPath);
  }
}

export async function stopAll() {
  const running = discoverRunning();
  if (running.length === 0) {
    console.log("No services are running.");
    return;
  }

  for (const name of running) {
    await stop(name);
  }
}

export function getStatus(name) {
  const service = services[name];
  const pid = readPid(name);
  const running = pid !== null && isRunning(pid);
  const crashed = pid !== null && !running;
  const logAvailable = hasLog(name);
  const errors =
    running || crashed || logAvailable
      ? countErrors(name, service?.type ?? "node")
      : 0;
  const lastLog =
    running || crashed || logAvailable
      ? stripAnsi(readLastLine(logFile(name), service?.lastLogMapper))
      : "";

  return {
    name,
    running,
    crashed,
    pid,
    port: service?.port,
    hasLog: logAvailable,
    errors,
    lastLog,
  };
}

export function printStatusTable(names) {
  const statuses = names.map(getStatus);
  const green = (value) => `\x1b[32m${value}\x1b[0m`;
  const red = (value) => `\x1b[31m${value}\x1b[0m`;
  const yellow = (value) => `\x1b[33m${value}\x1b[0m`;
  const dim = (value) => `\x1b[2m${value}\x1b[0m`;
  const pad = (value, width) =>
    value + " ".repeat(Math.max(0, width - stripAnsi(value).length));

  const maxName = Math.max(7, ...statuses.map((status) => status.name.length));
  const columns = [maxName, 9, 7, 6];
  const header = [
    "Service".padEnd(columns[0]),
    "Status".padEnd(columns[1]),
    "Errors".padEnd(columns[2]),
    "Port".padEnd(columns[3]),
    "Last Log",
  ].join("  ");

  console.log();
  console.log(header);
  console.log("─".repeat(stripAnsi(header).length));

  for (const status of statuses) {
    const statusText = status.crashed
      ? red("crashed")
      : status.running
        ? status.errors > 0
          ? yellow("running")
          : green("running")
        : red("stopped");
    const errorText =
      status.running || status.crashed || status.hasLog
        ? status.errors > 0
          ? yellow(String(status.errors))
          : String(status.errors)
        : "-";
    const portText = status.port ? String(status.port) : "-";
    const logText = status.lastLog
      ? status.lastLog.length > 70
        ? `${status.lastLog.slice(0, 70)}...`
        : status.lastLog
      : dim("-");

    console.log(
      [
        pad(status.name, columns[0]),
        pad(statusText, columns[1]),
        pad(errorText, columns[2]),
        pad(portText, columns[3]),
        logText,
      ].join("  "),
    );
  }

  console.log();
}

async function runWrapper(name) {
  const service = services[name];
  if (!service) {
    console.error(`Unknown service: ${name}`);
    process.exit(1);
  }

  ensureLogsDir();

  const logPath = logFile(name);
  const output =
    process.platform === "win32" ? null : createWriteStream(logPath);
  const logFd = process.platform === "win32" ? openSync(logPath, "a") : null;
  const stripAnsiTransform = () =>
    new Transform({
      transform(chunk, _encoding, callback) {
        callback(null, Buffer.from(stripAnsi(chunk.toString())));
      },
    });

  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    stdio:
      process.platform === "win32" && logFd !== null
        ? ["ignore", logFd, logFd]
        : ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(service.env ?? {}),
      FORCE_COLOR: "0",
      PATH: buildPath(service.cwd),
    },
    shell: service.shell ?? false,
    windowsHide: true,
  });

  if (output) {
    child.stdout.pipe(stripAnsiTransform()).pipe(output);
    child.stderr.pipe(stripAnsiTransform()).pipe(output);
  }

  let stoppedBySignal = false;

  child.on("exit", (code) => {
    if (output) {
      output.end();
    }
    if (logFd !== null) {
      closeSync(logFd);
    }
    if (stoppedBySignal) {
      const pidPath = pidFile(name);
      if (existsSync(pidPath)) {
        unlinkSync(pidPath);
      }
    }
    process.exit(code ?? 1);
  });

  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      stoppedBySignal = true;
      child.kill(signal);
    });
  }
}

if (process.argv[2] === "_run") {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: node manager.mjs _run <serviceName>");
    process.exit(1);
  }

  runWrapper(name);
}
