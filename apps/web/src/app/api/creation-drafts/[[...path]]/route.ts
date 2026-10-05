import type { NextRequest } from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function forward(request:NextRequest){
  const base=process.env.API_INTERNAL_URL??"http://127.0.0.1:3001";
  const path=request.nextUrl.pathname.replace(/^\/api/,""),target=new URL(path,base);target.search=request.nextUrl.search;
  const headers=new Headers(request.headers);for(const name of ["host","connection","transfer-encoding","content-length"])headers.delete(name);
  const hasBody=request.method!=="GET"&&request.method!=="HEAD";
  const response=await fetch(target,{method:request.method,headers,body:hasBody?request.body:null,signal:request.signal,redirect:"manual",cache:"no-store",...(hasBody?{duplex:"half"}: {})} as RequestInit);
  const outgoing=new Headers(response.headers);for(const name of ["connection","transfer-encoding","content-encoding","content-length"])outgoing.delete(name);
  outgoing.set("cache-control","private, no-store");outgoing.set("referrer-policy","no-referrer");
  return new Response(response.body,{status:response.status,headers:outgoing});
}
export { forward as GET,forward as POST,forward as PATCH,forward as PUT,forward as DELETE };
