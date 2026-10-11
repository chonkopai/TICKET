import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import https from 'node:https';
import {prisma} from '../dist/index.js';
import {newEventCreationDraft,newHallObject,editorHallV3} from '../../shared-types/dist/index.js';
import {DevelopmentPaymentProvider} from '../../../apps/api/dist/booking/payment-provider.js';
const directory=process.argv[2];assert.ok(directory);
assert.ok(/^\/event_platform_ngrok_v2_\d+$/.test(new URL(process.env.DATABASE_URL).pathname));
const fixture=JSON.parse(await readFile(join(directory,'smoke-fixture.json'),'utf8'));
const origin=process.env.WEB_ORIGIN;assert.equal(new URL(origin).hostname,'sulphate-shown-subtract.ngrok-free.dev');
const report={at:new Date().toISOString(),origin,scope:'Disposable ngrok fixtures; HTTPS HTTP calls, signed mock payments only',checks:[],events:[]};
async function session(role){const cookies=new Map();let token;
 async function request(path,method='GET',body,extra={}){
  const headers={origin,'ngrok-skip-browser-warning':'true',...(token?{authorization:'Bearer '+token}:{}),...(cookies.size?{cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}:{}),...extra};
  const bytes=Buffer.isBuffer(body);if(body!==undefined&&!bytes&&!headers['content-type'])headers['content-type']='application/json';
  // Use HTTP/1.1 for the tunnel: Node 26's negotiated HTTP/2 fetch socket can close here.
  const payload=body===undefined?undefined:bytes?body:Buffer.from(JSON.stringify(body));
  if(payload)headers['content-length']=String(payload.length);
  const response=await new Promise((resolve,reject)=>{const req=https.request(origin+path,{method,headers,timeout:30000},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const outgoing=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)outgoing.append(res.rawHeaders[i],res.rawHeaders[i+1]);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:outgoing}));});res.on('error',reject);});req.on('timeout',()=>req.destroy(new Error('HTTPS request timed out')));req.on('error',reject);req.end(payload);});
  for(const item of response.headers.getSetCookie()){const [pair]=item.split(';'),i=pair.indexOf('=');if(pair.slice(i+1))cookies.set(pair.slice(0,i),pair.slice(i+1));else cookies.delete(pair.slice(0,i));}
  if(!response.ok){let detail;try{detail=(await response.json()).code;}catch{}throw Error(`${method} ${path} failed HTTP ${response.status} ${detail??''}`);}
  if(response.headers.get('content-type')?.includes('application/json'))return response.json();return Buffer.from(await response.arrayBuffer());
 }
 const login=await request('/auth/password/login','POST',{method:'email',target:`ngrok-smoke-${role}@example.invalid`,password:fixture.password});token=login.tokens.accessToken;assert.ok(token);return request;
}
try{
 const owner=await session('owner'),buyer=await session('buyer');report.checks.push('password authentication over ngrok HTTPS using disposable fixture identities');
 async function publish(mode){
  let saved=await owner('/api/creation-drafts','POST',{sourceLocale:'en'});fixture.drafts??=[];fixture.drafts.push(saved.id);await writeFile(join(directory,'smoke-fixture.json'),JSON.stringify(fixture),{mode:0o600});
  const body=await readFile(join(directory,'fixture.png'));
  const reservation=await owner(`/api/creation-drafts/${saved.id}/media`,'POST',{revision:saved.revision,slot:1,bytes:body.length,contentType:'image/png'},{'x-draft-csrf':saved.csrfToken});
  const uploaded=await owner(`/api/creation-drafts/${saved.id}/media/${reservation.asset.id}/upload`,'PUT',body,{'x-draft-csrf':reservation.draft.csrfToken,'content-type':'image/png'});saved=uploaded.draft;assert.equal(uploaded.asset.state,'ready');
  const aggregate=newEventCreationDraft(randomUUID(),'en');aggregate.selectedMode=mode;aggregate.currency='USD';aggregate.content.en={title:'Ngrok API '+mode,summary:'Disposable smoke test',description:'Real HTTPS publication and purchasing verification.',venueName:'Test hall',address:'Test address',refundConditions:'Refund before the event'};aggregate.classification={countryCode:'KZ',city:'Almaty',category:'music',ageRestriction:0};aggregate.schedule={startLocal:'2035-12-01T20:00',endLocal:'2035-12-02T01:00',timezone:'Asia/Almaty',startChoice:null,endChoice:null};aggregate.refundsAvailable=true;aggregate.paidGeneral=[{id:randomUUID(),active:true,amount:1234,capacity:3,content:{en:{name:'Adult'}}}];aggregate.media.slots[1]=uploaded.asset.id;aggregate.media.cardAssetId=uploaded.asset.id;aggregate.media.backgroundAssetId=uploaded.asset.id;
  if(mode==='paid_seated'){const tariff=randomUUID(),table=randomUUID();aggregate.paidSeated=editorHallV3({widthM:20,heightM:20},{version:1,objects:[{...newHallObject(randomUUID(),'seat',4,4),number:1,tariffId:tariff},{...newHallObject(table,'table_rect',10,10),number:1,tariffId:tariff,saleMode:'whole_table'},{...newHallObject(randomUUID(),'seat',10,9),parentId:table,side:'top'}],tariffs:[{id:tariff,name:'VIP',color:'#6320ee',price:2300}]},null,'en');}
  const {selectedMode,currency,content,classification,schedule,refundsAvailable,paidGeneral,paidSeated,media}=aggregate;
  saved=await owner(`/api/creation-drafts/${saved.id}`,'PATCH',{revision:saved.revision,patch:{selectedMode,currency,acknowledgeCurrencyRelabel:true,content,classification,schedule,refundsAvailable,paidGeneral,paidSeated,media}},{'x-draft-csrf':saved.csrfToken});
  const validation=await owner(`/api/creation-drafts/${saved.id}/validate`,'POST',{revision:saved.revision},{'x-draft-csrf':saved.csrfToken});assert.equal(validation.valid,true);
  const intent=await owner(`/api/creation-drafts/${saved.id}/publish-intent`,'POST',{revision:saved.revision},{'x-draft-csrf':saved.csrfToken});
  const published=await owner(`/api/creation-drafts/${saved.id}/publish`,'POST',{intentId:intent.id},{'x-draft-csrf':saved.csrfToken});fixture.events.push(published.eventId);await writeFile(join(directory,'smoke-fixture.json'),JSON.stringify(fixture),{mode:0o600});
  const event=await owner(`/api/events/${published.eventId}?locale=en`);assert.equal(event.creationVersion,2);assert.equal(event.saleMode,mode);assert.equal(event.media[0].slot,1);assert.equal(event.media[0].isCard,true);report.events.push(published.eventId);
  const edited=await owner(`/api/creation-drafts/owned/${event.id}`,'POST');fixture.drafts.push(edited.id);await writeFile(join(directory,'smoke-fixture.json'),JSON.stringify(fixture),{mode:0o600});
  const changed=await owner(`/api/creation-drafts/${edited.id}`,'PATCH',{revision:edited.revision,patch:{content:{en:{title:event.title+' edited'}}}},{'x-draft-csrf':edited.csrfToken});
  await owner(`/api/creation-drafts/${edited.id}/save-owned`,'POST',{revision:changed.revision},{'x-draft-csrf':changed.csrfToken});assert.equal((await owner(`/api/events/${event.id}?locale=en`)).title,event.title+' edited');
  report.checks.push(`${mode}: processed image, slot 2 Main/Background, overnight USD publication, public rendering and protected edit over HTTPS`);return {event,aggregate};
 }
 async function settleRefund(eventId,checkout){
  const before=await prisma.order.findUniqueOrThrow({where:{id:checkout.orderId}});assert.equal(before.checkoutSnapshot.version,2);assert.equal(before.checkoutSnapshot.amount,before.amount);
  const payment=await prisma.payment.findFirstOrThrow({where:{orderId:before.id}}),signed=DevelopmentPaymentProvider.signWebhook({eventId:randomUUID(),eventType:'payment.succeeded',providerPaymentId:payment.providerPaymentId,orderId:before.id,amount:before.amount,currency:before.currency.trim()},process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET);
  const response=await fetch('http://127.0.0.1:3001/payments/webhooks/mock',{method:'POST',headers:{...signed.headers,'content-type':'application/json'},body:new Uint8Array(signed.rawBody)});assert.equal(response.status,200);
  const ticket=await buyer(`/me/tickets/${checkout.ticketIds[0]}?locale=en`);assert.equal(ticket.status,'active');assert.ok((await buyer(`/me/tickets/${ticket.id}/qr`)).length>0);
  const refund=await owner(`/api/organizer/events/${eventId}/orders/${before.id}/refund`,'POST',{reason:'Disposable ngrok smoke refund'});assert.equal(refund.amount,before.amount);assert.equal(refund.status,'succeeded');assert.equal((await owner(`/api/organizer/events/${eventId}/orders/${before.id}/refund`,'POST',{reason:'Disposable ngrok smoke refund'})).id,refund.id);
  assert.deepEqual((await prisma.order.findUniqueOrThrow({where:{id:before.id}})).checkoutSnapshot,before.checkoutSnapshot);report.checks.push(`original ${before.amount} ${before.currency.trim()} minor-unit payment, admission/QR and exact-once refund with unchanged snapshot`);
 }
 const general=await publish('paid_general');const ticketInput={ticketTypeId:general.aggregate.paidGeneral[0].id,quantity:1,termsAccepted:true,policyRevision:1,contentLocale:'en'},key=randomUUID(),checkout=await buyer('/me/checkouts/tickets','POST',ticketInput,{'Idempotency-Key':key});assert.equal(checkout.amountDue,1234);await assert.rejects(buyer('/me/checkouts/tickets','POST',{...ticketInput,deposit:0},{'Idempotency-Key':randomUUID()}),/HTTP 400/);await assert.rejects(buyer('/me/checkouts/tickets','POST',{...ticketInput,quantity:11},{'Idempotency-Key':randomUUID()}),/HTTP 400/);report.checks.push('metadata-free running API rejects deposit input and invalid quantity before checkout');assert.equal((await buyer('/me/checkouts/tickets','POST',ticketInput,{'Idempotency-Key':key})).orderId,checkout.orderId);await settleRefund(general.event.id,checkout);
 const seated=await publish('paid_seated'),hall=seated.aggregate.paidSeated,seat=hall.objects.find(x=>x.type==='seat'&&!x.parentId),table=hall.objects.find(x=>x.type==='table_rect');const cart=await buyer('/me/checkouts/cart','POST',{eventId:seated.event.id,tickets:[],tableId:table.id,seatIds:[seat.id],termsAccepted:true,policyRevision:1,contentLocale:'en'},{'Idempotency-Key':randomUUID()});assert.equal(cart.amountDue,4600);await settleRefund(seated.event.id,cart);
 const free=(await prisma.event.findMany({where:{organizerId:fixture.owner,saleMode:'free'}}))[0];assert.ok(free,'Browser free publication must complete first');fixture.events.push(free.id);const freeType=await prisma.ticketType.findFirstOrThrow({where:{eventId:free.id}});const registration=await buyer('/me/checkouts/tickets','POST',{ticketTypeId:freeType.id,quantity:1,termsAccepted:true,policyRevision:1,contentLocale:'en'},{'Idempotency-Key':randomUUID()});assert.equal(registration.amountDue,0);assert.equal((await buyer(`/me/tickets/${registration.ticketIds[0]}?locale=en`)).status,'active');assert.ok((await buyer(`/me/tickets/${registration.ticketIds[0]}/qr`)).length>0);await buyer(`/me/tickets/${registration.ticketIds[0]}/cancel`,'POST',{confirmed:true},{'Idempotency-Key':randomUUID()});report.checks.push('browser-published free event registers immediately, issues QR and cancels without payment');
 assert.equal(await prisma.deposit.count({where:{eventId:{in:fixture.events}}}),0);report.checks.push('all current checkout modes create zero Deposit rows');report.passed=true;await writeFile(join(directory,'smoke-fixture.json'),JSON.stringify(fixture),{mode:0o600});await writeFile('docs/event-creation-v2/ngrok-v2-smoke.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await prisma.$disconnect();}
