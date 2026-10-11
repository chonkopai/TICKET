import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EVENT_TEXT_LIMITS, eventContentV2Schema, richDescriptionBody, wrapRichDescription } from "@event-platform/shared-types";
import { descriptionEditorHtml, encodeDescription, safeDescriptionLink, sanitizeDescriptionHtml } from "./rich-description";
import { EventDescription } from "../components/event-description";

test("existing plain text and literal HTML survive without becoming markup", () => {
  const text = 'Line one\n<h1>literal & text</h1>';
  assert.equal(richDescriptionBody(text), null);
  assert.equal(descriptionEditorHtml(text), '<p>Line one</p><p>&lt;h1&gt;literal &amp; text&lt;/h1&gt;</p>');
  assert.match(renderToStaticMarkup(<EventDescription value={text} />), /&lt;h1&gt;literal &amp; text&lt;\/h1&gt;/);
  assert.equal(encodeDescription("<p>Line one</p><p>Line two</p>", "Line one\nLine two"), "Line one\nLine two");
});

test("requested formatting persists and renders through the shared public component", () => {
  const html = '<h1>Programme</h1><h2>Guests</h2><p><strong>Bold</strong> <em>Italic</em></p><ul><li><p>One</p></li></ul><ol start="3"><li><p>Three</p></li></ol><p><a href="https://example.com">Details</a></p>';
  const stored = encodeDescription(html, "Programme\nGuests\nBold Italic\nOne\nThree\nDetails");
  assert.ok(richDescriptionBody(stored));
  assert.equal(descriptionEditorHtml(stored), sanitizeDescriptionHtml(html));
  const rendered = renderToStaticMarkup(<EventDescription value={stored} />);
  for (const tag of ["h1", "h2", "strong", "em", "ul", "ol", "li", "a"]) assert.match(rendered, new RegExp(`<${tag}[ >]`));
  assert.match(rendered, /rel="noopener noreferrer"/);
  assert.equal(encodeDescription("<p><br></p>", "\n"), "");
});

test("pasted or forged HTML cannot introduce scripts, styling, media, or unsafe links", () => {
  const malicious = '<script>alert(1)</script><iframe src="https://evil.test"></iframe><img src=x onerror=alert(1)><p style="color:red" onclick="alert(1)">Safe</p><a href="javascript:alert(1)">Bad</a><a href="//evil.test">Relative</a><a href="data:text/html,evil">Data</a>';
  const rendered = renderToStaticMarkup(<EventDescription value={wrapRichDescription(malicious)} />);
  assert.doesNotMatch(rendered, /script|iframe|onerror|onclick|style=|javascript:|data:text|href="\/\//);
  assert.match(rendered, /Safe/);
  for (const url of ["javascript:alert(1)", "data:text/html,evil", "//evil.test", "https://user:pass@example.com", "file:///tmp/a", "https://"]) assert.equal(safeDescriptionLink(url), null);
  assert.equal(safeDescriptionLink(" https://example.com/info "), "https://example.com/info");
  assert.equal(safeDescriptionLink("mailto:guest@example.com"), "mailto:guest@example.com");
});

test("formatted storage remains subject to the existing description limit", () => {
  const stored = encodeDescription(`<p><strong>${"a".repeat(EVENT_TEXT_LIMITS.description)}</strong></p>`, "a".repeat(EVENT_TEXT_LIMITS.description));
  assert.equal(eventContentV2Schema.safeParse({ description: stored }).success, false);
  assert.equal(eventContentV2Schema.safeParse({ description: encodeDescription("<p><strong>Short</strong></p>", "Short") }).success, true);
});
