import { redirect } from "next/navigation";

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const incoming = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["lang", "search", "city", "category", "datePreset", "from", "to", "free", "paymentMode", "minPrice", "maxPrice", "sort"]) {
    const value = incoming[key];
    if (typeof value === "string") params.set(key, value);
  }
  redirect(params.size ? `/?${params.toString()}` : "/");
}
