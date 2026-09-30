import type { ExchangeRates } from "../../../lib/display-currency";

const SOURCE = "https://nationalbank.kz/rss/rates_all.xml";

function item(xml: string, code: "RUB" | "USD"): { rate: number; date: string } | null {
  const block = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]).find((value) => value && new RegExp(`<title>\\s*${code}\\s*<\\/title>`, "i").test(value));
  if (!block) return null;
  const rawRate = block.match(/<description>\s*([\d.,]+)\s*<\/description>/i)?.[1];
  const rawQuant = block.match(/<quant>\s*(\d+)\s*<\/quant>/i)?.[1] ?? "1";
  const date = block.match(/<pubDate>\s*([^<]+)\s*<\/pubDate>/i)?.[1]?.trim() ?? "";
  const rate = Number(rawRate?.replace(",", ".")) / Number(rawQuant);
  return Number.isFinite(rate) && rate > 0 && date ? { rate, date } : null;
}

export async function GET() {
  try {
    const response = await fetch(SOURCE, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("National Bank feed unavailable");
    const xml = await response.text();
    const rub = item(xml, "RUB");
    const usd = item(xml, "USD");
    if (!rub || !usd || rub.date !== usd.date) throw new Error("Invalid National Bank rates");
    const result: ExchangeRates = { asOf: rub.date, kztPerRub: rub.rate, kztPerUsd: usd.rate };
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
  } catch {
    return Response.json({ error: "Курсы валют временно недоступны" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
