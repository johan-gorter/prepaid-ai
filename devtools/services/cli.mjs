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
Prepaid AI Dev Service Manager

Commands:
  start <name...>   Start one or more services
  wait <name...>    Wait until one or more service ports are open
  stop [name...]    Stop one or more services, or all if omitted
  restart [name...] Restart one or more services, or all if omitted
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
      if (targets.length === 0) {
        console.error("Error: start requires at least one service name.\n");
        printUsage();
        process.exit(1);
      }

      for (const target of targets) {
        start(resolveTarget(target));
      }
      break;
    }

    case "stop": {
      if (targets.length === 0) {
        console.log("Stopping all services...");
        await stopAll();
        break;
      }

      for (const target of targets) {
        await stop(resolveTarget(target));
      }
      break;
    }

    case "wait": {
      if (targets.length === 0) {
        console.error("Error: wait requires at least one service name.\n");
        printUsage();
        process.exit(1);
      }

      try {
        const names = targets.map(resolveTarget);
        await waitForServices(names);
        console.log(`Services ready: ${names.join(", ")}`);
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

      const names = targets.map(resolveTarget);
      for (const name of names) {
        await stop(name);
      }
      for (const name of names) {
        start(name);
      }
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
