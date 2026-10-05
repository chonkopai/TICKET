import { eventContentV2Schema, isoToZonedInput, type EventLocale } from "@event-platform/shared-types";
import type { Event, Prisma, PrismaClient } from "./generated/prisma/client.js";

/** Only a complete reconciled aggregate can opt into normalized compatibility reads. */
export async function eventV2CompatibilityRead(database: Pick<PrismaClient, "eventContent">, event: Event, enabled = process.env.EVENT_CONTENT_V2_ENABLED === "true"): Promise<Event> {
  if (!enabled || event.v2State !== "reconciled") return event;
  const content = await database.eventContent.findUnique({where:{eventId_locale:{eventId:event.id,locale:event.sourceLocale}}});
  if (!content || ![content.title,content.summary,content.description,content.venueName,content.address].every(value=>value?.trim())) return event;
  const local = event.startsAt ? isoToZonedInput(event.startsAt.toISOString(),event.timezone) : null;
  return {...event,title:content.title!,announcement:content.summary,description:content.description,venueName:content.venueName!,address:content.address!,
    cancellationTerms:content.refundConditions,program:null,rules:null,visitTerms:null,extraConditions:null,
    ...(local?{date:new Date(`${local.slice(0,10)}T00:00:00Z`),time:new Date(`1970-01-01T${local.slice(11)}:00Z`)}:{})};
}

/** Caller owns authorization; locks/revision keep dual writes within one transaction. */
export async function saveEventContentV2(transaction: Prisma.TransactionClient, eventId: string, locale: EventLocale, input: unknown, expectedRevision: number, enabled = process.env.EVENT_CONTENT_V2_ENABLED === "true") {
  if (!enabled) throw new Error("EVENT_V2_ROLLOUT_DISABLED");
  const patch=eventContentV2Schema.parse(input);
  await transaction.$queryRaw`SELECT id FROM "Event" WHERE id=${eventId}::uuid FOR UPDATE`;
  const event=await transaction.event.findUniqueOrThrow({where:{id:eventId}});
  if(event.revision!==expectedRevision)throw new Error("DRAFT_REVISION_CONFLICT");
  const existing=await transaction.eventContent.findUnique({where:{eventId_locale:{eventId,locale}}});
  if(locale===event.sourceLocale&&!existing)throw new Error("EVENT_V2_RECONCILIATION_REQUIRED");
  const values={title:patch.title??existing?.title??null,summary:patch.summary??existing?.summary??null,description:patch.description??existing?.description??null,venueName:patch.venueName??existing?.venueName??null,address:patch.address??existing?.address??null,refundConditions:patch.refundConditions??existing?.refundConditions??null};
  const fieldMetadata=(existing?.fieldMetadata&&typeof existing.fieldMetadata==="object"&&!Array.isArray(existing.fieldMetadata)?{...existing.fieldMetadata}:{}) as Record<string,Prisma.JsonValue>;
  const changed=Object.keys(patch).filter(field=>values[field as keyof typeof values]!==existing?.[field as keyof typeof values]);
  for(const field of changed){
    const previous=fieldMetadata[field];
    const revision=previous&&typeof previous==="object"&&!Array.isArray(previous)&&typeof previous.revision==="number"?previous.revision+1:1;
    fieldMetadata[field]={origin:locale===event.sourceLocale?"source":"manual",sourceHash:locale===event.sourceLocale?createHash("sha256").update(JSON.stringify(values[field as keyof typeof values])).digest("hex"):null,reviewed:locale===event.sourceLocale,stale:false,revision};
  }
  const row=await transaction.eventContent.upsert({where:{eventId_locale:{eventId,locale}},create:{eventId,locale,...values,fieldMetadata:fieldMetadata as Prisma.InputJsonObject,managedBy:"editor"},update:{...values,fieldMetadata:fieldMetadata as Prisma.InputJsonObject,managedBy:"editor",legacyHash:null,revision:{increment:1}}});
  if(locale===event.sourceLocale&&changed.length){
    const targets=await transaction.eventContent.findMany({where:{eventId,locale:{not:locale}}});
    for(const target of targets){
      const metadata=(target.fieldMetadata&&typeof target.fieldMetadata==="object"&&!Array.isArray(target.fieldMetadata)?{...target.fieldMetadata}:{}) as Record<string,Prisma.JsonValue>;
      for(const field of changed){
        const previous=metadata[field];
        if(previous&&typeof previous==="object"&&!Array.isArray(previous))metadata[field]={...previous,stale:true};
      }
      await transaction.eventContent.update({where:{eventId_locale:{eventId,locale:target.locale}},data:{fieldMetadata:metadata as Prisma.InputJsonObject,revision:{increment:1}}});
    }
  }
  if(locale===event.sourceLocale){
    // A partial source edit must not synthesize missing required legacy values.
    await transaction.event.update({where:{id:eventId},data:{
      ...(values.title?.trim()?{title:values.title}:{}),...(values.venueName?.trim()?{venueName:values.venueName}:{}),...(values.address?.trim()?{address:values.address}:{}),
      announcement:values.summary,description:values.description,cancellationTerms:values.refundConditions,program:null,rules:null,visitTerms:null,extraConditions:null,
    }});
  } else if(values.title?.trim()&&values.venueName?.trim()&&values.address?.trim()) {
    const content={title:values.title,venueName:values.venueName,address:values.address,announcement:values.summary,description:values.description,cancellationTerms:values.refundConditions,program:null,rules:null,visitTerms:null,extraConditions:null,depositTerms:null,origin:"manual",sourceHash:null,translatedFrom:null};
    await transaction.eventTranslation.upsert({where:{eventId_locale:{eventId,locale}},create:{eventId,locale,...content},update:content});
  } else await transaction.eventTranslation.deleteMany({where:{eventId,locale}});
  // The SQL invalidators may already have advanced revision. Advance exactly once
  // for this aggregate operation and keep it explicitly dirty until publication.
  await transaction.event.update({where:{id:eventId},data:{v2State:"dirty",legacyFingerprint:null,revision:expectedRevision+1}});
  return row;
}
import { createHash } from "node:crypto";
