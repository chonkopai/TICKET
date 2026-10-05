"use client";
import type { PublicEventMedia } from "@event-platform/shared-types";
import { FramedMedia } from "./event-creation/framed-media";
export function PublicFramedAsset({asset,className="",controls=false}:{asset:PublicEventMedia;role?:"card"|"featured"|"background"|"gallery";className?:string;controls?:boolean}){
 const crop=asset.crops.card;
 return <div className={className}><FramedMedia src={asset.url} poster={asset.posterUrl??undefined} kind={asset.kind} width={asset.width} height={asset.height} crop={crop} alt={asset.caption??""} controls={controls} className="h-full w-full"/></div>;
}
