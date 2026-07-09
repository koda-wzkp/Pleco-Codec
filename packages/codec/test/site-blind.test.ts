// Acceptance §12: grep-ing the site layer for "square" or "stripe" returns
// only the config file — in this core package, the site layer must contain
// NEITHER string at all (processor names live only in billing/ and config).

import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SITE_DIR = join(process.cwd(), "src", "site");

test("src/site contains no processor names (acceptance §12 grep check)", () => {
  const files = readdirSync(SITE_DIR).filter((f) => /\.(ts|tsx)$/.test(f));
  assert.ok(files.length >= 5, `expected site components, found: ${files.join(", ")}`);
  for (const file of files) {
    const content = readFileSync(join(SITE_DIR, file), "utf8").toLowerCase();
    for (const processor of ["square", "stripe"]) {
      assert.ok(
        !content.includes(processor),
        `${file} mentions "${processor}" — the site layer must be processor-blind`,
      );
    }
  }
});

test("site components use stable codec-* classNames", () => {
  const wanted = [
    ["TierPanels.tsx", "codec-tier-panels"],
    ["PerksList.tsx", "codec-perks-list"],
    ["WaitlistForm.tsx", "codec-waitlist-form"],
    ["ManageLink.tsx", "codec-manage-link"],
  ] as const;
  for (const [file, className] of wanted) {
    const content = readFileSync(join(SITE_DIR, file), "utf8");
    assert.ok(content.includes(className), `${file} missing ${className}`);
  }
});

test("WaitlistForm keeps the honeypot and never clears input on error", () => {
  const content = readFileSync(join(SITE_DIR, "WaitlistForm.tsx"), "utf8");
  assert.ok(content.includes('name="company"'), "honeypot field present");
  assert.ok(
    !/form\.reset\(\)/.test(content),
    "error path must never clear the member's input",
  );
});
