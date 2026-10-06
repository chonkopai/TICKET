import { describe, expect, it, vi } from 'vitest';
import { eventV2CompatibilityRead, saveEventContentV2 } from '../src/event-v2-compat.js';
import type { Event, Prisma, PrismaClient } from '../src/generated/prisma/client.js';

const event={id:'test',sourceLocale:'ru',v2State:'reconciled',title:'legacy',startsAt:new Date('2026-10-02T12:00:00Z'),timezone:'Asia/Almaty'} as Event;
describe('normalized compatibility rollout',()=>{
  it('keeps default-off and unresolved legacy reads query-free',async()=>{
    const findUnique=vi.fn();const db={eventContent:{findUnique}} as unknown as Pick<PrismaClient,'eventContent'>;
    expect(await eventV2CompatibilityRead(db,event,false)).toBe(event);
    expect(await eventV2CompatibilityRead(db,{...event,v2State:'review'},true)).toEqual({...event,v2State:'review'});
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('requires complete source and derives legacy display time from canonical UTC',async()=>{
    const findUnique=vi.fn().mockResolvedValueOnce({title:'partial'}).mockResolvedValueOnce({title:'Normalized',description:'Merged',address:'Address',refundConditions:'Policy'});
    const db={eventContent:{findUnique}} as unknown as Pick<PrismaClient,'eventContent'>;
    expect(await eventV2CompatibilityRead(db,event,true)).toBe(event);
    const read=await eventV2CompatibilityRead(db,event,true);
    expect(read.title).toBe('Normalized');expect(read.address).toBe('Address');
    expect(read.program).toBeNull();expect(read.time.toISOString()).toBe('1970-01-01T17:00:00.000Z');
  });
  it('blocks writes when rollout is disabled before touching the database',async()=>{
    await expect(saveEventContentV2({} as Prisma.TransactionClient,'event','ru',{},1,false)).rejects.toThrow('EVENT_V2_ROLLOUT_DISABLED');
  });
  it('rejects a stale revision under the event lock',async()=>{
    const lock=vi.fn(),findUniqueOrThrow=vi.fn().mockResolvedValue({revision:2});
    const tx={$queryRaw:lock,event:{findUniqueOrThrow}} as unknown as Prisma.TransactionClient;
    await expect(saveEventContentV2(tx,'event','ru',{},1,true)).rejects.toThrow('DRAFT_REVISION_CONFLICT');
    expect(lock).toHaveBeenCalledOnce();
  });
});
