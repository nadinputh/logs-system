export type PredictedAction = "checkout_suggested" | "neutral";

/**
 * Returns 'checkout_suggested' when time-of-day signals the user should check out.
 * Rule: after 16:30 local time and the user has an open check-in, nudge them to check out.
 */
export function getPredictedAction(
  openLogTimestamp: string | Date,
  now: Date = new Date(),
): PredictedAction {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const isPastCheckoutWindow = hours > 16 || (hours === 16 && minutes >= 30);

  if (isPastCheckoutWindow) return "checkout_suggested";
  return "neutral";
}

export function formatDuration(
  from: string | Date,
  to: Date = new Date(),
): string {
  const ms = to.getTime() - new Date(from).getTime();
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
