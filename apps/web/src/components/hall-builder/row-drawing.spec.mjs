import test from 'node:test';
import assert from 'node:assert/strict';
import { fitBlock, newHall, seatPositions, worldBounds } from './model.mjs';
import { builderToVenue, venueToBuilder } from './venue-adapter.ts';

test('drawing curved row blocks keeps the full footprint within the drawn area',()=>{
  for(const curvature of [-80,0,80])for(const aisle of ['none','left','center','right']){
    const object=fitBlock(600,400,420,300,{curvature,aisle,aisleWidth:48,rowPitch:52,seatPitch:30});
    const box=worldBounds(object);
    assert.ok(box.left>=390&&box.right<=810);
    assert.ok(box.top>=250&&box.bottom<=550);
  }
});

test('configured row creation options and numbering survive canonical save and reopening',()=>{
  const hall=newHall(),options={name:'Балкон',aisle:'right',aisleWidth:48,seatPitch:28,rowPitch:52,curvature:12,firstRow:4,firstSeat:11,reverse:true};
  const object=fitBlock(600,400,420,300,options);hall.objects=[object];
  const reopened=venueToBuilder(builderToVenue(hall),hall).objects[0];
  for(const key of Object.keys(options))assert.equal(reopened[key],options[key],key);
  assert.deepEqual(reopened.seats.map(s=>s.id),object.seats.map(s=>s.id));
  assert.deepEqual(seatPositions(reopened).map(s=>[s.rowNumber,s.number]),seatPositions(object).map(s=>[s.rowNumber,s.number]));
});
