type Location = { address: string; coordinates?: { latitude: number; longitude: number } | null };

/** Prefer the organizer's saved map pin over an ambiguous address search. */
export function eventMapUrl({ address, coordinates }: Location): string | null {
  const point = coordinates;
  const query = point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
    ? `${point.latitude},${point.longitude}` : address.trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}
