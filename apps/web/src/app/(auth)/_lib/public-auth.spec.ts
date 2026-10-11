import assert from "node:assert/strict";
import { test } from "node:test";
import { safeReturnPath } from "./public-auth";

test("login defaults to the main page, preserving language and safe return links", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const check = (search: string, expected: string) => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search, origin: "https://ticket.example" } } });
    assert.equal(safeReturnPath(), expected);
  };
  try {
    check("?lang=ru", "/?lang=ru");
    check("?lang=kk", "/?lang=kk");
    check("?lang=en", "/?lang=en");
    check("", "/?lang=ru");
    check("?lang=en&returnTo=%2Fcheckout%3Forder%3D123", "/checkout?order=123");
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/\nevil.example"]) {
      check(`?lang=en&returnTo=${encodeURIComponent(value)}`, "/?lang=en");
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
