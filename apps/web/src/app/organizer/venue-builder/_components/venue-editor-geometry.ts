/** Keep a dragged object's origin inside the real room, with optional half-metre snapping. */
export function roomCoordinate(raw: number, maximum: number, snapEnabled: boolean): number {
  const aligned = snapEnabled ? Math.round(raw * 2) / 2 : raw;
  return Math.min(Math.max(0, aligned), Math.max(0, maximum));
}
