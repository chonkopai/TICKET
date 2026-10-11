import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { THEME_BOOTSTRAP } from "./theme";

function boot(stored: string | null, systemDark: boolean, storageBlocked = false) {
  const document = { documentElement: { dataset: {} as { theme?: string } } };
  runInNewContext(THEME_BOOTSTRAP, {
    document,
    localStorage: { getItem: () => { if (storageBlocked) throw new Error("Storage blocked"); return stored; } },
    matchMedia: () => ({ matches: systemDark }),
  });
  return document.documentElement.dataset.theme;
}

test("saved choices override either system preference before rendering", () => {
  assert.equal(boot("light", true), "light");
  assert.equal(boot("dark", false), "dark");
});

test("new visitors and invalid preferences follow the system theme", () => {
  assert.equal(boot(null, true), "dark");
  assert.equal(boot(null, false), "light");
  assert.equal(boot("unknown", true), "dark");
});

test("restricted storage does not break startup", () => {
  assert.equal(boot(null, true, true), "dark");
  assert.equal(boot(null, false, true), "light");
});

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(value => Number.parseInt(value, 16) / 255);
  const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return linear[0]! * .2126 + linear[1]! * .7152 + linear[2]! * .0722;
}
function contrast(first: string, second: string) {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

test("dark theme text, button labels and input boundaries have readable contrast", () => {
  const css = readFileSync("apps/web/src/components/theme.css", "utf8").split(':root[data-theme="dark"] {')[1]!.split("}")[0]!;
  const colors = Object.fromEntries([...css.matchAll(/--ticket-([\w-]+): (#[\da-f]{6});/g)].map(match => [match[1], match[2]])) as Record<string, string>;
  for (const text of ["text", "muted", "dim", "accent"]) for (const background of ["bg", "surface", "raised"]) {
    assert.ok(contrast(colors[text]!, colors[background]!) >= 4.5, `${text} on ${background}`);
  }
  for (const status of ["danger", "success", "warning", "info"]) {
    assert.ok(contrast(colors[status]!, colors[`${status}-soft`]!) >= 4.5, status);
  }
  assert.ok(contrast("#ffffff", colors.primary!) >= 4.5);
  assert.ok(contrast(colors["input-border"]!, colors.raised!) >= 3);
});
