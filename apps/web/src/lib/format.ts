const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats an ISO date (YYYY-MM-DD) without shifting it across the viewer's time zone. */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(`${iso}T00:00:00Z`));
}

export function formatPeriod(startsOn: string, endsOn: string): string {
  return `${formatDate(startsOn)} – ${formatDate(endsOn)}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
