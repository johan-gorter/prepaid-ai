import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(THIS_DIR, "../..");
export const LOGS_DIR = resolve(REPO_ROOT, "logs", "services");

export const ERROR_PATTERNS = {
  node: /\b(error|uncaught|exception)\b/i,
  vite: /\b(error|failed)\b/i,
  firebase: /^(?:Error:|.*could not start.*|.*port taken.*)$/i,
};

export const services = {
  dev: {
    command: "npm",
    args: ["-s", "run", "dev", "--", "--host", "localhost"],
    cwd: REPO_ROOT,
    port: 5173,
    type: "vite",
    shell: true,
    lastLogMapper: (line) => {
      if (/Local:/i.test(line) || /ready in/i.test(line)) return line.trim();
      if (/error/i.test(line)) return line.trim();
      return undefined;
    },
  },
  "dev:emulators": {
    command: "npm",
    args: ["-s", "run", "dev:emulators", "--", "--host", "localhost"],
    cwd: REPO_ROOT,
    port: 5174,
    type: "vite",
    shell: true,
    lastLogMapper: (line) => {
      if (/Local:/i.test(line) || /ready in/i.test(line)) return line.trim();
      if (/error/i.test(line)) return line.trim();
      return undefined;
    },
  },
  "preview:emulators": {
    command: "npm",
    args: ["-s", "run", "preview:emulators"],
    cwd: REPO_ROOT,
    port: 4175,
    type: "vite",
    shell: true,
    lastLogMapper: (line) => {
      if (/Local:/i.test(line) || /ready in/i.test(line)) return line.trim();
      if (/error/i.test(line)) return line.trim();
      return undefined;
    },
  },
  emulators: {
    command: "npm",
    args: ["-s", "run", "emulators"],
    cwd: REPO_ROOT,
    port: 4000,
    type: "firebase",
    shell: true,
    lastLogMapper: (line) => {
      if (/All emulators ready/i.test(line)) return line.trim();
      if (/View Emulator UI/i.test(line)) return line.trim();
      if (/^Error:|could not start|port taken/i.test(line)) return line.trim();
      return undefined;
    },
  },
};
