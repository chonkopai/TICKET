import { parseHistoricalPurchaseSnapshot } from "./event-creation-v2.js";
import { isoToZonedInput } from "./timezone.js";
import type { CheckoutSnapshot } from "./booking.js";
/** One version boundary for account, delivery, payment, management and refund readers. */
export function readCheckoutSnapshot(value:unknown):CheckoutSnapshot{
 const parsed=parseHistoricalPurchaseSnapshot(value);if(parsed.version===1)return (parsed.raw&&typeof parsed.raw==="object"&&!Array.isArray(parsed.raw)?parsed.raw:{}) as CheckoutSnapshot;
 const data=parsed.snapshot,local=isoToZonedInput(data.startsAt,data.timezone),items=data.items.map(item=>({id:item.resourceId,kind:item.kind,name:item.name,quantity:item.quantity,amountDue:item.unitAmount*item.quantity}));
 return {eventId:data.eventId,eventTitle:data.title,eventDate:local.slice(0,10),eventTime:local.slice(11),eventTimezone:data.timezone,venueName:data.venueName,address:data.address,itemId:items[0]!.id,itemName:items.map(item=>item.name).join(", "),itemKind:data.saleMode==="free"?"ticket":data.selection?.kind??(items.length>1?"cart":items[0]!.kind==="table"?"table":"ticket"),quantity:items.reduce((sum,item)=>sum+item.quantity,0),paymentMode:"full_payment",paymentLabel:"full_payment",unitFullAmount:items[0]!.amountDue/items[0]!.quantity,fullAmount:data.amount,amountDue:data.amount,currency:data.currency,cancellationTerms:data.refund.conditions,depositTerms:null,items,...(data.selection?{...(data.selection.seatIds?{seatIds:data.selection.seatIds}:{}),...(data.selection.seatLabels?{seatLabels:data.selection.seatLabels}:{}),...(data.selection.groupPass!==undefined?{groupPass:data.selection.groupPass}:{})}:{}),acceptedPolicy:data.refund,contentLocale:data.contentLocale};
}

export function acceptedResourceName(snapshot:CheckoutSnapshot,ids:ReadonlyArray<string|null|undefined>,fallback:string):string{return snapshot.acceptedPolicy?snapshot.items?.find(item=>ids.includes(item.id))?.name??fallback:fallback;}
