import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {prisma} from '../dist/index.js';
import {DraftMediaStorage} from '../../../apps/api/dist/creation-drafts/draft-media-storage.js';
const directory=process.argv[2],fixture=JSON.parse(await readFile(join(directory,'smoke-fixture.json'),'utf8'));
assert.ok(/^\/event_platform_ngrok_v2_\d+$/.test(new URL(process.env.DATABASE_URL).pathname));
const users=[fixture.owner,fixture.buyer],sourceUsers=JSON.parse(await readFile(join(directory,'report.json'),'utf8')).accountPreservation.User;
try{
 for(const id of users){const user=await prisma.user.findUniqueOrThrow({where:{id},include:{contactIdentities:true}});assert.ok(user.name?.startsWith('Ngrok verification '));assert.ok(user.contactIdentities.some(x=>/^ngrok-smoke-(owner|buyer)@example\.invalid$/.test(x.normalizedIdentifier)));}
 const retainedUserRows=await prisma.user.findMany({where:{id:{notIn:users}},orderBy:{id:'asc'}});
 const events=(await prisma.event.findMany({where:{organizerId:{in:users}},select:{id:true}})).map(x=>x.id);
 const drafts=(await prisma.eventCreationDraft.findMany({where:{OR:[{ownerId:{in:users}},{editingEventId:{in:events}},{resultEventId:{in:events}},{id:{in:fixture.drafts??[]}}]},select:{id:true}})).map(x=>x.id);
 const orders=(await prisma.order.findMany({where:{buyerUserId:{in:users}},select:{id:true}})).map(x=>x.id);
 // Protect any tester purchase made against a verification event while this turn runs.
 const others=await prisma.order.findMany({where:{buyerUserId:{notIn:users}},select:{checkoutSnapshot:true}});
 assert.ok(!others.some(x=>events.includes(x.checkoutSnapshot?.eventId)),'A retained user purchased a verification event; keep that event/history for review');
 const assets=(await prisma.mediaAsset.findMany({where:{OR:[{draftId:{in:drafts}},{eventId:{in:events}}]},select:{id:true}})).map(x=>x.id);
 const tickets=(await prisma.ticket.findMany({where:{orderId:{in:orders}},select:{id:true}})).map(x=>x.id);
 const payments=(await prisma.payment.findMany({where:{orderId:{in:orders}},select:{id:true}})).map(x=>x.id);
 const types=(await prisma.ticketType.findMany({where:{eventId:{in:events}},select:{id:true}})).map(x=>x.id);
 const tables=(await prisma.table.findMany({where:{venueLayout:{eventId:{in:events}}},select:{id:true}})).map(x=>x.id);
 const aggregateIds=[...events,...orders,...drafts,...assets,...tickets,...payments,...types,...tables,...users];
 fixture.cleanupManifest={orders,tables,aggregateIds};await writeFile(join(directory,'smoke-fixture.json'),JSON.stringify(fixture),{mode:0o600});
 await prisma.$transaction(async tx=>{
  await tx.refundRequest.deleteMany({where:{orderId:{in:orders}}});await tx.webhookEvent.deleteMany({where:{orderId:{in:orders}}});await tx.idempotencyRecord.deleteMany({where:{userId:{in:users}}});await tx.order.deleteMany({where:{id:{in:orders}}});
  await tx.event.updateMany({where:{id:{in:events}},data:{status:'draft'}});await tx.eventPublishIntent.deleteMany({where:{draftId:{in:drafts}}});
  await tx.eventCreationDraft.updateMany({where:{id:{in:drafts}},data:{state:'deleted',resultEventId:null}});await tx.eventMedia.deleteMany({where:{eventId:{in:events}}});
  await tx.mediaAsset.deleteMany({where:{id:{in:assets}}});await tx.eventCreationDraft.deleteMany({where:{id:{in:drafts}}});await tx.event.deleteMany({where:{id:{in:events}}});
  await tx.auditLog.deleteMany({where:{actorId:{in:users}}});await tx.outboxEvent.deleteMany({where:{aggregateId:{in:aggregateIds}}});await tx.user.deleteMany({where:{id:{in:users}}});
 },{timeout:30000});
 const storage=new DraftMediaStorage({directory:process.env.DRAFT_MEDIA_STORAGE_DIR,ffmpeg:'unused',ffprobe:'unused',imageBytes:1,videoBytes:1,videoSeconds:1,draftBytes:1});for(const id of assets)await storage.delete(id);
 assert.deepEqual(await prisma.user.findMany({where:{id:{in:retainedUserRows.map(x=>x.id)}},orderBy:{id:'asc'}}),retainedUserRows,'Cleanup must preserve every retained user row');
 const evidence=(await prisma.$queryRawUnsafe(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM "User" t`))[0];
 const report={at:new Date().toISOString(),scope:'Only named disposable verification identities and their records removed; other new tester records preserved',removed:{users:users.length,events:events.length,drafts:drafts.length,orders:orders.length,assets:assets.length},retainedUsers:evidence.count,retainedUsersUnchanged:true,originalUserRowsEqual:evidence.count===sourceUsers.count&&evidence.digest===sourceUsers.digest,remaining:{events:await prisma.event.count(),orders:await prisma.order.count(),tickets:await prisma.ticket.count(),drafts:await prisma.eventCreationDraft.count()}};
 await writeFile('docs/event-creation-v2/ngrok-smoke-cleanup.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await prisma.$disconnect();}
