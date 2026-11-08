import type { HallEditor, HallObject } from '@event-platform/shared-types';
export type SaleUnit = 'seat'|'table'|'entry';
export interface BuilderSeat {id:string;rowId?:string;dx:number;dy:number;disabled:boolean;categoryId:string|null;angle?:number;number?:number;source?:HallObject}
export interface BuilderRow {id:string;count:number;dx:number;dy:number;categoryId:string|null;pitch?:number;source?:HallObject}
export interface BuilderObject {
  id:string;type:'rows'|'round'|'rect'|'standing'|'stage'|'obstacle'|'entrance'|'seat';name:string;x:number;y:number;w:number;h:number;rotation:number;pinned:boolean;disabled:boolean;categoryId:string|null;color:string;opacity:number;
  seats?:BuilderSeat[];rows?:BuilderRow[];rowCount?:number;seatsPerRow?:number;seatPitch?:number;rowPitch?:number;aisle?:'none'|'center'|'left'|'right';aisleWidth?:number;firstRow?:number;firstSeat?:number;reverse?:boolean;curvature?:number;
  count?:number;saleMode?:'whole_table'|'per_seat';arrangement?:'even'|'open'|'two'|'three'|'all'|'custom';chairOffset?:number;sides?:number[];capacity?:number|null;points?:Array<{x:number;y:number}>|null;entranceType?:'in'|'out'|'both';number?:number;source?:HallObject;
}
export interface BuilderCategory {id:string;name:string;price:number|null;unit:SaleUnit;color:string;active:boolean;source?:HallEditor['tariffs'][number]}
export interface BuilderHall {version:1;id:string;name:string;currency:string;room:{w:number;h:number};objects:BuilderObject[];categories:BuilderCategory[];revision:number}
export interface BuilderLibraryItem {id:string;hall:BuilderHall;updatedAt:number;archived:boolean}
export interface BuilderHost {initialHall:BuilderHall;startInEditor?:boolean;finishLabel?:string;savedLabel?:string;backLabel?:string;onOpenClassic?:()=>Promise<void>;recoveryKey:string;fragmentStorageKey?:string;readOnly:boolean;busy?:boolean;theme:string;toggleTheme:()=>void;save:(hall:BuilderHall)=>Promise<void>;onChange:(hall:BuilderHall)=>void;hasUnsavedChanges:()=>boolean;onFinish:()=>Promise<void>;onBack:()=>Promise<void>;library:BuilderLibraryItem[];libraryError:string;updateLibrary:(id:string,patch:{name?:string;archived?:boolean})=>Promise<void>;saveLibrary:(hall:BuilderHall)=>Promise<BuilderLibraryItem>}
