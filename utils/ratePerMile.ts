function parseMiles(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sumLoadedAndEmptyMiles(
  loadedMiles: unknown,
  emptyMiles: unknown,
): number | null {
  const loaded = parseMiles(loadedMiles);
  if (loaded == null) return null;

  const empty = parseMiles(emptyMiles) ?? 0;
  const total = loaded + empty;
  return total > 0 ? total : null;
}

/** Prefer stored total_miles; otherwise loaded + empty (empty defaults to 0). */
export function resolveOfferTotalMiles(
  loadedMiles: unknown,
  emptyMiles: unknown,
  totalMiles: unknown,
): number | null {
  const storedTotal = parseMiles(totalMiles);
  if (storedTotal != null && storedTotal > 0) return storedTotal;

  return sumLoadedAndEmptyMiles(loadedMiles, emptyMiles);
}

export function formatRatePerMile(
  rate: unknown,
  totalMiles: number | null | undefined,
): string | null {
  const rateNum = parseMiles(rate);
  if (rateNum == null) return null;
  if (totalMiles == null || !Number.isFinite(totalMiles) || totalMiles <= 0) {
    return null;
  }

  return `$${(rateNum / totalMiles).toFixed(2)}`;
}
