import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {prisma} from '../dist/index.js';
import {newEventCreationDraft,readCheckoutSnapshot} from '../../shared-types/dist/index.js';
import {assertIsolated} from './v2-rehearsal-lib.mjs';
import {CreationDraftsService} from '../../../apps/api/dist/creation-drafts/creation-drafts.service.js';
import {DraftPublicationService} from '../../../apps/api/dist/creation-drafts/draft-publication.service.js';
import {csrfFor} from '../../../apps/api/dist/creation-drafts/draft-security.js';
import {DraftMediaStorage} from '../../../apps/api/dist/creation-drafts/draft-media-storage.js';
import {DraftMediaProcessor} from '../../../apps/api/dist/creation-drafts/draft-media-processor.js';
import {DraftMediaService} from '../../../apps/api/dist/creation-drafts/draft-media.service.js';
import {DomainEventsService} from '../../../apps/api/dist/domain-events/domain-events.service.js';
import {TicketTypesService} from '../../../apps/api/dist/ticket-types/ticket-types.service.js';
import {TablesService} from '../../../apps/api/dist/tables/tables.service.js';
import {BookingService} from '../../../apps/api/dist/booking/booking.service.js';
import {CheckoutEmailService} from '../../../apps/api/dist/booking/checkout-email.service.js';
import {DevelopmentPaymentProvider} from '../../../apps/api/dist/booking/payment-provider.js';
import {PaymentService} from '../../../apps/api/dist/payments/payment.service.js';
import {RefundService} from '../../../apps/api/dist/booking/refund.service.js';
import {TicketsService} from '../../../apps/api/dist/tickets/tickets.service.js';
import {PublicEventsService} from '../../../apps/api/dist/public-events/public-events.service.js';
const [action,mediaDirectory,fixturePath,output]=process.argv.slice(2);
if(!['prepare','resume'].includes(action)||!mediaDirectory?.startsWith('/private/')||!fixturePath||!output)throw Error('Use prepare|resume /private/media fixture.json report.json');
const database=assertIsolated(process.env.DATABASE_URL),clock={now:()=>new Date()},domain=new DomainEventsService(),types=new TicketTypesService(prisma,domain),tables=new TablesService(prisma,domain,{holdTtlSeconds:600,cleanupIntervalSeconds:60},clock),provider=new DevelopmentPaymentProvider('http://localhost:3100','isolated-stage-secret'),payments=new PaymentService(prisma,provider,domain,clock),booking=new BookingService(prisma,types,tables,domain,{checkoutTtlSeconds:3600,cleanupIntervalSeconds:60},clock,payments,new CheckoutEmailService({})),refunds=new RefundService(prisma,provider,domain,clock),tickets=new TicketsService(prisma,domain,{isConfigured:()=>false,generate:async()=>Buffer.alloc(0)}),publicEvents=new PublicEventsService(prisma,types,tables);
const config={webOrigin:'http://localhost:3100',hmacSecret:'isolated-stage-draft-secret',secureCookies:false,anonymousSeconds:86400,ownedSeconds:86400,cleanupGraceSeconds:86400,creationHourlyLimit:200},drafts=new CreationDraftsService(prisma,config,[{code:'USD',exponent:2},{code:'KZT',exponent:2}]),publication=new DraftPublicationService(drafts,{organizerRequiresApproval:false}),storage=new DraftMediaStorage({directory:mediaDirectory,ffmpeg:process.env.MEDIA_FFMPEG_PATH,ffprobe:process.env.MEDIA_FFPROBE_PATH,imageBytes:10*1024**2,videoBytes:100*1024**2,videoSeconds:60,draftBytes:250*1024**2}),media=new DraftMediaService(drafts,storage,new DraftMediaProcessor(storage));
const report={at:new Date().toISOString(),database,scope:'Isolated staging fixture; signed development payments only',action,checks:[]};
try {
 if(action==='prepare') {
  const owner=randomUUID(),buyer=randomUUID();await prisma.user.createMany({data:[{id:owner,name:'Isolated cutover organizer',role:'guest'},{id:buyer,name:'Isolated cutover buyer',role:'guest'}]});
  const created=await drafts.create('en',randomUUID()),id=created.draft.id,access={capability:created.capability,quotaScope:'browser:'+randomUUID()};access.csrf=csrfFor(id,access,config.hmacSecret,true);
  const require=createRequire(new URL('../../../apps/api/package.json',import.meta.url)),sharp=require('sharp');
  const png=await sharp({create:{width:800,height:500,channels:3,background:'#6d28d9'}}).png().toBuffer();
  const reserved=await media.reserve(id,access,{revision:1,slot:1,bytes:png.length,contentType:'image/png'});const {asset}=await media.upload(id,reserved.asset.id,access,Readable.from(png),'image/png');
  const current=await drafts.read(id,access),draft=newEventCreationDraft(randomUUID(),'en');
  draft.selectedMode='paid_general';draft.currency='USD';draft.content.en={title:'Isolated cutover concert',summary:'Restore rehearsal',description:'Publication, pending payment and media restoration rehearsal.',venueName:'Rehearsal hall',address:'Isolated test address',refundConditions:'Refund before the event'};draft.classification={countryCode:'KZ',city:'Almaty',category:'music',ageRestriction:0};draft.schedule={startLocal:'2035-12-01T20:00',endLocal:'2035-12-02T01:00',timezone:'Asia/Almaty',startChoice:null,endChoice:null};draft.refundsAvailable=true;draft.paidGeneral=[{id:randomUUID(),active:true,amount:1234,capacity:3,content:{en:{name:'Adult'}}}];draft.media.slots[1]=asset.id;draft.media.cardAssetId=asset.id;draft.media.backgroundAssetId=asset.id;
  const saved=await drafts.mutate(id,access,current.revision,()=>draft),intent=await publication.intent(id,access,saved.revision),authenticated={...access,principal:{userId:owner,role:'guest',sessionFamilyId:'stage'}};authenticated.csrf=csrfFor(id,authenticated,config.hmacSecret,true);
  const published=await publication.publish(id,intent.id,authenticated),input={ticketTypeId:draft.paidGeneral[0].id,quantity:1,termsAccepted:true,contentLocale:'en',policyRevision:1},key=randomUUID(),checkout=await booking.checkoutTickets(buyer,key,input),order=await prisma.order.findUniqueOrThrow({where:{id:checkout.orderId}});
  assert.equal(order.amount,1234);assert.equal(order.currency.trim(),'USD');assert.equal(order.checkoutSnapshot.version,2);
  // A pre-cutover fixture preserves the legacy pricing contract; no current endpoint creates deposits.
  const historical=await prisma.event.create({data:{organizerId:owner,title:'Restored historical deposit',date:new Date('2035-12-01'),time:new Date('1970-01-01T20:00:00Z'),timezone:'Asia/Almaty',venueName:'Historical hall',address:'Original address',status:'published',paymentMode:'full_payment',cancellationTerms:'Original refund terms'}});
  const type=await types.create(owner,historical.id,{name:'Historical admission',price:10000,quantityTotal:2,status:'active'}),legacyKey=randomUUID(),legacyInput={ticketTypeId:type.id,quantity:1,termsAccepted:true},legacy=await booking.checkoutTickets(buyer,legacyKey,legacyInput),legacyRow=await prisma.order.findUniqueOrThrow({where:{id:legacy.orderId}}),snapshot={...legacyRow.checkoutSnapshot,paymentMode:'deposit',paymentLabel:'deposit',amountDue:1500,fullAmount:null,depositTerms:'Original deposited amount and terms'};
  await prisma.order.update({where:{id:legacy.orderId},data:{amount:1500,checkoutSnapshot:snapshot}});await prisma.payment.updateMany({where:{orderId:legacy.orderId},data:{amount:1500}});await prisma.deposit.create({data:{eventId:historical.id,orderId:legacy.orderId,amount:1500,currency:'KZT',terms:snapshot.depositTerms}});await prisma.event.update({where:{id:historical.id},data:{paymentMode:'deposit',depositTerms:'Current text must not replace accepted terms'}});await prisma.idempotencyRecord.updateMany({where:{resourceId:legacy.orderId},data:{response:{...legacy,paymentMode:'deposit',paymentLabel:'deposit',amountDue:1500,fullAmount:null}}});
  await writeFile(fixturePath,JSON.stringify({owner,buyer,eventId:published.eventId,assetId:asset.id,orders:[{id:order.id,key,input,ticketId:checkout.ticketIds[0],snapshot:order.checkoutSnapshot,amount:1234,currency:'USD'},{id:legacy.orderId,key:legacyKey,input:legacyInput,ticketId:legacy.ticketIds[0],snapshot,amount:1500,currency:'KZT'}],legacyEventId:historical.id}),{mode:0o600});
  report.checks.push('anonymous draft, processed image, non-slot-zero Main/Background, auth claim and publication','new USD order pending at 1234 minor units; no new-format Deposit','historical pending deposit fixture at original 1500 KZT with immutable terms');
  report.orders=[{id:order.id,amount:1234,currency:'USD',version:2},{id:legacy.orderId,amount:1500,currency:'KZT',version:1}];
 } else {
  const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
  const event=await publicEvents.get(fixture.eventId,new Date(),'en');assert.equal(event.title,'Isolated cutover concert');assert.equal(event.media[0].id,fixture.assetId);await storage.info(fixture.assetId,'display.webp');
  for(const entry of fixture.orders) {
   const before=await prisma.order.findUniqueOrThrow({where:{id:entry.id}});assert.equal(before.paymentStatus,'pending');assert.deepEqual(before.checkoutSnapshot,entry.snapshot);
   const replay=await booking.checkoutTickets(fixture.buyer,entry.key,entry.input);assert.equal(replay.orderId,entry.id);assert.equal(replay.amountDue,entry.amount);
   const payment=await prisma.payment.findFirstOrThrow({where:{orderId:entry.id}}),signed=DevelopmentPaymentProvider.signWebhook({eventId:randomUUID(),eventType:'payment.succeeded',providerPaymentId:payment.providerPaymentId,orderId:entry.id,amount:entry.amount,currency:entry.currency},'isolated-stage-secret'),webhook=provider.verifyWebhook(signed);
   await booking.handlePaymentWebhook(webhook);const duplicate=await booking.handlePaymentWebhook(webhook);assert.equal(duplicate.duplicate,true);
   const active=await tickets.getForUser(fixture.buyer,entry.ticketId,'en');assert.equal(active.status,'active');assert.equal(readCheckoutSnapshot(entry.snapshot).amountDue,entry.amount);
   const svg=await tickets.renderQrForUser(fixture.buyer,entry.ticketId);assert.ok(svg); // QR generation uses persisted admission identity.
   const eventId=entry.snapshot.eventId,refund=await refunds.request(fixture.owner,eventId,entry.id,'Isolated restore refund');assert.equal(refund.amount,entry.amount);assert.equal(refund.status,'succeeded');assert.equal((await refunds.request(fixture.owner,eventId,entry.id,'Isolated restore refund')).id,refund.id);
   assert.deepEqual((await prisma.order.findUniqueOrThrow({where:{id:entry.id}})).checkoutSnapshot,entry.snapshot);
  }
  await assert.rejects(booking.checkoutTickets(fixture.buyer,randomUUID(),fixture.orders[1].input),error=>error.getResponse().code==='LEGACY_DEPOSIT_SALES_CLOSED');
  report.checks.push('current binary reads restored normalized content and local media','both pending formats replay unchanged and accept one original-amount signed payment','both formats issue historical QR/admission and refund once without rewriting snapshots','new deposit sale is rejected after restore');
  report.restoredOrders=fixture.orders.map(({id,amount,currency})=>({id,amount,currency,status:'refunded'}));
 }
 report.passed=true;await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await prisma.$disconnect();}
