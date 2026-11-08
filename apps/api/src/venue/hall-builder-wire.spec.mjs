import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../../../web/src/app/(auth)/_lib/api';
import { saveEventHallLibrary } from '../../../web/src/lib/event-hall-library';
import { starterHall } from '../../../web/src/components/hall-builder/model.mjs';
import { builderToVenue } from '../../../web/src/components/hall-builder/venue-adapter';
import { rejectHallDepositInput } from '../events/current-sale-policy.js';

vi.mock('../../../web/src/app/(auth)/_lib/api',()=>({apiRequest:vi.fn()}));
vi.mock('../../../web/src/app/(auth)/_lib/session',()=>({getSession:()=>({user:{id:'organizer',role:'organizer'}})}));
afterEach(()=>vi.resetAllMocks());

describe('hall builder HTTP save contract',()=>{
  for(const kind of ['empty','rows','tables','standing','mixed'])it(`saves the actual ${kind} library request through the API deposit guard`,async()=>{
    const hall=starterHall(kind,'KZT'),internal=builderToVenue(hall);
    vi.mocked(apiRequest).mockImplementation(async(path,options)=>{
      expect(path).toBe('/api/organizer/venue-layout-templates');
      const body=JSON.parse(String(options?.body));
      rejectHallDepositInput(body.layoutJson);
      expect(body.layoutJson).toEqual({version:2,...internal,editor:{...internal.editor,objects:internal.editor.objects.map(({deposit,...object})=>object)},tables:[],rows:[]});
      return {id:crypto.randomUUID(),revision:1,eventId:null,organizerId:'organizer',templateName:hall.name,currency:'KZT',layoutJson:{version:2,...internal,tables:[],rows:[]},tables:[],rows:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    });
    const item=await saveEventHallLibrary(hall,'ru');
    expect(item.hall.name).toBe(hall.name);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it('continues rejecting explicit deposits at any depth, including zero',()=>{
    for(const deposit of [0,100])expect(()=>rejectHallDepositInput({editor:{objects:[{deposit}]}})).toThrow('Deposit pricing is no longer accepted.');
  });
});
