import { describe,expect,it } from "vitest";
import { eventContentHash,TRANSLATABLE_EVENT_FIELDS } from "./event-translation-content.js";
import type { EventLocalizedContent } from "@event-platform/shared-types";
describe("historical translation content",()=>{
 it("preserves the legacy field order and marks a changed historical translation stale",()=>{
  const content=Object.fromEntries(TRANSLATABLE_EVENT_FIELDS.map(field=>[field,field==="title"?"Historical event":null])) as unknown as EventLocalizedContent;
  expect(eventContentHash(content)).toBe(eventContentHash({...content}));
  expect(eventContentHash({...content,depositTerms:"Original terms"})).not.toBe(eventContentHash(content));
 });
});
