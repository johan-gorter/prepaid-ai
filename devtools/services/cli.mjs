#!/usr/bin/env node

import {
  discoverRunning,
  printStatusTable,
  start,
  stop,
  stopAll,
  waitForServices,
} from "./manager.mjs";
import { services } from "./registry.mjs";

function printUsage() {
  console.log(`
Renovision AI Dev Service Manager

Commands:
  start <name>      Start one service
  wait <name>       Wait until one service port is open
  stop [name]       Stop one service, or all if omitted
  restart [name]    Restart one service, or all if omitted
  status            Show status of all tracked services

Services:
  ${Object.keys(services).join(", ")}
`);
}

function resolveTarget(target) {
  if (!services[target]) {
    console.error(`Unknown service: ${target}`);
    process.exit(1);
  }

  return target;
}

async function main() {
  const command = process.argv[2];
  const targets = process.argv.slice(3);

  switch (command) {
    case "start": {
      if (targets.length !== 1) {
        console.error("Error: start requires exactly one service name.\n");
        printUsage();
        process.exit(1);
      }

      start(resolveTarget(targets[0]));
      break;
    }

    case "stop": {
      if (targets.length === 0) {
        console.log("Stopping all services...");
        await stopAll();
        break;
      }

      if (targets.length !== 1) {
        console.error("Error: stop accepts at most one service name.\n");
        printUsage();
        process.exit(1);
      }

      await stop(resolveTarget(targets[0]));
      break;
    }

    case "wait": {
      if (targets.length !== 1) {
        console.error("Error: wait requires exactly one service name.\n");
        printUsage();
        process.exit(1);
      }

      try {
        const name = resolveTarget(targets[0]);
        await waitForServices([name]);
        console.log(`Service ready: ${name}`);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
      break;
    }

    case "restart": {
      if (targets.length === 0) {
        console.log("Restarting all services...");
        const running = discoverRunning();
        for (const name of running) {
          await stop(name);
        }
        for (const name of running) {
          start(name);
        }
        break;
      }

      if (targets.length !== 1) {
        console.error("Error: restart accepts at most one service name.\n");
        printUsage();
        process.exit(1);
      }

      const name = resolveTarget(targets[0]);
      await stop(name);
      start(name);
      break;
    }

    case "status": {
      printStatusTable(Object.keys(services));
      break;
    }

    default:
      printUsage();
      if (command) {
        process.exit(1);
      }
  }
}

main();
