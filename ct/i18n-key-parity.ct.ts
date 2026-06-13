import { expect, test } from "@playwright/experimental-ct-vue";
import en from "../src/i18n/locales/en";
import nl from "../src/i18n/locales/nl";

// The English catalog is the schema source of truth and `vue-tsc -b` already
// fails the build if a key is *missing* from Dutch. This test guards the other
// direction (a stray key in nl that has no English counterpart) and gives a
// readable, locale-agnostic failure listing exactly which dotted key paths
// drifted — far friendlier than a structural type error buried in a 280-line
// object literal.
type MessageTree = { [key: string]: string | MessageTree };

function keyPaths(tree: MessageTree, prefix = ""): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") {
      paths.push(...keyPaths(value, path));
    } else {
      paths.push(path);
    }
  }
  return paths.sort();
}

test.describe("i18n locale key parity", () => {
  test("en and nl expose identical key sets", () => {
    const enKeys = keyPaths(en as unknown as MessageTree);
    const nlKeys = keyPaths(nl as unknown as MessageTree);

    const missingInNl = enKeys.filter((key) => !nlKeys.includes(key));
    const extraInNl = nlKeys.filter((key) => !enKeys.includes(key));

    expect(missingInNl, "keys present in en but missing in nl").toEqual([]);
    expect(extraInNl, "keys present in nl but missing in en").toEqual([]);
  });
});
