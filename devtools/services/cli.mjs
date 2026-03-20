#!/usr/bin/env node

import {
  discoverRunning,
  printStatusTable,
  start,
  stop,
  stopAll,
  waitForServices,
} from "./manager.mjs";
import { groups, resolveServices, services } from "./registry.mjs";

function printUsage() {
  console.log(`
Renovision AI Dev Service Manager

Commands:
  start <name...>   Start one or more services/groups
  wait <name...>    Wait until service/group ports are open
  stop [name...]    Stop services/groups, or all if omitted
  restart [name...] Restart services/groups, or all if omitted
  status            Show status of all tracked services

Services:
  ${Object.keys(services).join(", ")}

Groups:
  ${Object.entries(groups)
    .map(([name, members]) => `${name}: ${members.join(", ")}`)
    .join("\n  ")}
`);
}

function resolveTargets(names) {
  const resolvedNames = [];
  const seen = new Set();

  for (const name of names) {
    const resolved = resolveServices(name);
    if (resolved.length === 0) {
      console.error(`Unknown service or group: ${name}`);
      process.exit(1);
    }

    for (const serviceName of resolved) {
      if (!seen.has(serviceName)) {
        seen.add(serviceName);
        resolvedNames.push(serviceName);
      }
    }
  }

  return resolvedNames;
}

async function main() {
  const command = process.argv[2];
  const targets = process.argv.slice(3);

  switch (command) {
    case "start": {
      if (targets.length === 0) {
        console.error("Error: start requires a service or group name.\n");
        printUsage();
        process.exit(1);
      }

      for (const name of resolveTargets(targets)) {
        start(name);
      }
      break;
    }

    case "stop": {
      if (targets.length === 0) {
        console.log("Stopping all services...");
        await stopAll();
        break;
      }

      for (const name of resolveTargets(targets)) {
        await stop(name);
      }
      break;
    }

    case "wait": {
      if (targets.length === 0) {
        console.error("Error: wait requires a service or group name.\n");
        printUsage();
        process.exit(1);
      }

      try {
        await waitForServices(resolveTargets(targets));
        console.log(`Services ready: ${resolveTargets(targets).join(", ")}`);
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

      const names = resolveTargets(targets);
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
