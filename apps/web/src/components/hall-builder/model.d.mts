import type { BuilderHall, BuilderObject, BuilderSeat, BuilderRow } from './types';
export const SCALE:number;
export const CHAIR:number;
export const DINER_WIDTH:number;
export const TABLE_CHAIR_OFFSET:number;
export function rulerTicks(length:number):number[];
export function withNaturalTableSpacing(hall:BuilderHall):BuilderHall;
export function newHall(name?:string):BuilderHall;
export function makeObject(type:BuilderObject['type'],x?:number,y?:number,options?:Partial<BuilderObject>):BuilderObject;
export function reconcile(object:BuilderObject):BuilderObject;
export function seatPositions(object:BuilderObject):Array<BuilderSeat&{x:number;y:number;number:number;rowNumber?:number;row?:BuilderRow;side?:number;angle?:number}>;
export function rotate(x:number,y:number,degrees:number):{x:number;y:number};
export function validateImport(value:unknown):BuilderHall;
export function copyHall(value:BuilderHall):BuilderHall;

export function starterHall(kind?:string,currency?:string):BuilderHall;
export function withInitialCategory(hall:BuilderHall):BuilderHall;
