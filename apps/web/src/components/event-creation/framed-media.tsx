"use client";
import { useEffect,useRef,useState } from "react";
import { mediaFrame,type MediaCrop } from "@event-platform/shared-types";
export type { MediaCrop } from "@event-platform/shared-types";
/** Shared by creation previews and public renderers: no independent object-fit crop. */
export function FramedMedia({src,poster,kind,width,height,crop,alt,className="",controls=false}:{src:string;poster?:string|undefined;kind:"image"|"video";width:number;height:number;crop:MediaCrop;alt:string;className?:string;controls?:boolean}){
  const container=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null);const [size,setSize]=useState({width:1,height:1}),[motion,setMotion]=useState(false),[paused,setPaused]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>{setFailed(false);setPaused(false);},[src]);
  useEffect(()=>{const node=container.current;if(!node)return;const observer=new ResizeObserver(([entry])=>{if(entry)setSize({width:entry.contentRect.width,height:entry.contentRect.height});});observer.observe(node);return()=>observer.disconnect();},[]);
  useEffect(()=>{const media=matchMedia("(prefers-reduced-motion: reduce)"),update=()=>setMotion(!media.matches&&!(navigator as Navigator & {connection?:{saveData?:boolean}}).connection?.saveData);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  const frame=mediaFrame(width,height,Math.max(1,size.width),Math.max(1,size.height),crop),style=kind==="video"&&controls?{position:"absolute" as const,left:0,top:0,width:"100%",height:"100%",objectFit:"contain" as const}:{position:"absolute" as const,left:frame.x,top:frame.y,width:frame.width,height:frame.height,maxWidth:"none"};
  useEffect(()=>{if(kind!=="video"||controls||!video.current)return;if(motion&&!paused&&!failed)void video.current.play().catch(()=>setFailed(true));else video.current.pause();},[kind,controls,motion,paused,failed,src]);
  return <div ref={container} className={`relative overflow-hidden bg-slate-100 dark:bg-ticket-raised ${className}`}>
    {kind==="image"||failed||!controls&&!motion?<img alt={alt} src={kind==="image"?src:poster} style={style}/>:<video ref={video} src={src} poster={poster} style={style} aria-label={alt} controls={controls} muted={!controls} playsInline loop={!controls} onError={()=>setFailed(true)}/>}
    {kind==="video"&&!controls&&motion&&!failed?<button type="button" className="absolute bottom-2 right-2 z-20 rounded-full bg-black/80 px-3 py-1 text-xs text-white" aria-label={paused?"Play background video":"Pause background video"} onClick={()=>setPaused(value=>!value)}>{paused?"▶":"Ⅱ"}</button>:null}
  </div>;
}
