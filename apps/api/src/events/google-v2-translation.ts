import { loadTranslationEnv } from "@event-platform/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { richDescriptionBody, wrapRichDescription, type EventLocale } from "@event-platform/shared-types";
export type TranslationConfig=ReturnType<typeof loadTranslationEnv>;
function unavailable(code:string):never{throw new ServiceUnavailableException({code});}
export function decodeTranslationEntities(value:string):string{
  return value.replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos);/gi,(match,entity:string)=>{
    const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};if(named[entity.toLowerCase()])return named[entity.toLowerCase()]!;
    const code=Number.parseInt(entity.slice(entity.toLowerCase().startsWith("#x")?2:1),entity.toLowerCase().startsWith("#x")?16:10);
    return Number.isInteger(code)&&code>=0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):match;
  });
}
/** The same Basic v2 integration is used by the existing event editor and drafts. */
export class GoogleV2Translation {
  readonly cacheNamespace = "google-v2:text";
  constructor(readonly config:TranslationConfig=loadTranslationEnv(),private readonly request:typeof fetch=fetch){}
  get configured(){return !!this.config.GOOGLE_TRANSLATE_API_KEY;}
  async translate(texts:string[],source:EventLocale,target:EventLocale):Promise<string[]>{
    if(!this.configured)unavailable("TRANSLATION_NOT_CONFIGURED");
    if(source===target)throw new Error("TRANSLATION_SAME_LOCALE");
    const result:string[]=Array.from({length:texts.length},()=>"");
    for (const format of ["text", "html"] as const) {
      const rows = texts.flatMap((text, index) => {
        const body = richDescriptionBody(text);
        return (body === null ? "text" : "html") === format ? [{ index, text: body ?? text }] : [];
      });
      for (let offset = 0; offset < rows.length; offset += 128) {
        const batch = rows.slice(offset, offset + 128);
        const translated = await this.chunk(batch.map(row => row.text), source, target, format);
        batch.forEach((row, index) => { result[row.index] = format === "html" ? wrapRichDescription(translated[index]!) : translated[index]!; });
      }
    }
    return result;
  }
  private async chunk(texts:string[],source:EventLocale,target:EventLocale,format:"text"|"html"="text"):Promise<string[]>{
    for(let attempt=0;attempt<=this.config.TRANSLATION_RETRIES;attempt++){
      try{
        const response=await this.request("https://translation.googleapis.com/language/translate/v2",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":this.config.GOOGLE_TRANSLATE_API_KEY!},body:JSON.stringify({q:texts,source,target,format}),signal:AbortSignal.timeout(this.config.TRANSLATION_TIMEOUT_MS)});
        if(!response.ok){if((response.status===429||response.status>=500)&&attempt<this.config.TRANSLATION_RETRIES){await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));continue;}unavailable("TRANSLATION_PROVIDER_UNAVAILABLE");}
        if(Number(response.headers?.get("content-length")??0)>1048576)unavailable("TRANSLATION_INVALID_RESPONSE");
        const payload=typeof response.text==="function"?await response.text():null;if(payload!==null&&Buffer.byteLength(payload)>1048576)unavailable("TRANSLATION_INVALID_RESPONSE");
        const body=(payload===null?await response.json():JSON.parse(payload)) as {data?:{translations?:Array<{translatedText?:unknown}>}},rows=body.data?.translations;
        if(!Array.isArray(rows)||rows.length!==texts.length||rows.some(row=>typeof row.translatedText!=="string"||(row.translatedText as string).length>640000))unavailable("TRANSLATION_INVALID_RESPONSE");
        return rows.map(row=>format === "html" ? row.translatedText as string : decodeTranslationEntities(row.translatedText as string));
      }catch(error){
        if(error instanceof ServiceUnavailableException)throw error;
        if(attempt<this.config.TRANSLATION_RETRIES){await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));continue;}
        unavailable(error instanceof Error&&["TimeoutError","AbortError"].includes(error.name)?"TRANSLATION_TIMEOUT":"TRANSLATION_PROVIDER_UNAVAILABLE");
      }
    }
    return unavailable("TRANSLATION_PROVIDER_UNAVAILABLE");
  }
}
