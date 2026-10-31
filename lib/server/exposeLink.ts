/**
 * A mailed link is a bearer credential: whoever holds an invite or set-password
 * link can claim the account for that address. Returning it to the person who
 * asked for the mail makes "token possession == email control" false, so in
 * production it is never returned; a failed send is reported as such and the
 * admin resends. Outside production (no SMTP in dev) the link is returned so
 * the flow stays testable.
 */
export function linkIfUndelivered(delivered: boolean, url: string): string | undefined {
  return !delivered && process.env.NODE_ENV !== "production" ? url : undefined;
}
