import { describe, expect, it } from "vitest";
import { applyCreationDraftPatch } from "./creation-drafts.js";
import { assetMediaCrop, boundedMediaCrop, DEFAULT_MEDIA_CROP, eventCreationDraftSchema, mediaFrame, mediaRoleCrops, newEventCreationDraft, panMediaCrop, readMediaCrop } from "./event-creation-v2.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

describe("one 16:9 crop per image", () => {
  it("starts at the smallest centered fill for portrait, landscape and exact 16:9 sources", () => {
    expect(mediaFrame(1600,900,160,90,DEFAULT_MEDIA_CROP)).toEqual({width:160,height:90,x:0,y:0});
    expect(mediaFrame(900,1600,160,90,DEFAULT_MEDIA_CROP)).toEqual({width:160,height:1600*160/900,x:0,y:(90-1600*160/900)/2});
    expect(mediaFrame(3200,900,160,90,DEFAULT_MEDIA_CROP)).toEqual({width:320,height:90,x:-80,y:0});
  });
  it("bounds extreme drags and zoom-out without gaps, at any preview size", () => {
    for (const [width,height] of [[900,1600],[3200,900],[1600,900]]) {
      let crop = panMediaCrop(width!,height!,{...DEFAULT_MEDIA_CROP,zoom:3},100,-100);
      crop = boundedMediaCrop(width!,height!,{...crop,zoom:1});
      for(const size of [160,390,1200]) {
        const frame=mediaFrame(width!,height!,size,size*9/16,crop);
        expect(frame.x).toBeLessThanOrEqual(0); expect(frame.y).toBeLessThanOrEqual(0);
        expect(frame.x+frame.width).toBeGreaterThanOrEqual(size-1e-9);
        expect(frame.y+frame.height).toBeGreaterThanOrEqual(size*9/16-1e-9);
      }
      expect(crop.zoom).toBe(1);
    }
  });
  it("moves immediately back from an edge instead of retaining an invisible excess drag", () => {
    const edge=panMediaCrop(1600,900,{...DEFAULT_MEDIA_CROP,zoom:2},100,0);
    expect(mediaFrame(1600,900,160,90,edge).x).toBe(0);
    const back=panMediaCrop(1600,900,edge,-.1,0);
    expect(mediaFrame(1600,900,160,90,back).x).toBeCloseTo(-16);
  });
  it("persists independent crops through edits, reorder, role changes and slot removal", () => {
    let draft=newEventCreationDraft(id(1));draft.media.slots=[id(2),id(3),null,null,null];
    const crop={focalX:.3,focalY:.7,zoom:2};
    draft=applyCreationDraftPatch(draft,{media:{assetCrops:{[id(2)]:crop}}});
    draft=applyCreationDraftPatch(draft,{media:{assetCrops:{[id(3)]:{...DEFAULT_MEDIA_CROP,zoom:1.5}}}});
    draft=applyCreationDraftPatch(draft,{media:{slots:[id(3),id(2),null,null,null],cardAssetId:id(2),backgroundAssetId:id(2)}});
    const loaded=eventCreationDraftSchema.parse(JSON.parse(JSON.stringify(draft)));
    expect(assetMediaCrop(loaded.media,id(2))).toEqual(crop);
    expect(assetMediaCrop(loaded.media,id(3)).zoom).toBe(1.5);
    draft=applyCreationDraftPatch(loaded,{media:{slots:[id(3),null,null,null,null],cardAssetId:id(3),backgroundAssetId:id(3)}});
    expect(draft.media.assetCrops[id(2)]).toBeUndefined();expect(draft.media.assetCrops[id(3)]?.zoom).toBe(1.5);
  });
  it("defaults old drafts and new images to a centered crop, and refuses foreign crop IDs", () => {
    const draft=newEventCreationDraft(id(1));const {assetCrops:_,...legacy}=draft.media;
    const loaded=eventCreationDraftSchema.parse({...draft,media:legacy});
    expect(assetMediaCrop(loaded.media,id(2))).toEqual(DEFAULT_MEDIA_CROP);
    expect(()=>applyCreationDraftPatch(loaded,{media:{assetCrops:{[id(2)]:DEFAULT_MEDIA_CROP}}})).toThrow();
  });
  it("reads historical published role crops while emitting one consistent crop for every placement", () => {
    const crop={focalX:.4,focalY:.7,zoom:2};
    expect(readMediaCrop(crop)).toEqual(crop);
    expect(readMediaCrop({...mediaRoleCrops(DEFAULT_MEDIA_CROP),backgroundDesktop:crop},"backgroundDesktop")).toEqual(crop);
    expect(new Set(Object.values(mediaRoleCrops(crop)).map(item=>JSON.stringify(item))).size).toBe(1);
  });
});
