/**
 * The fields every check-out document inherits from its check-in. Shared by the
 * visitor PATCH and the stale-log cron so both write the same shape; callers
 * add what is theirs (ip/user agent, autoCheckedOut, a capped timestamp).
 */
export function checkoutFields(checkin: any) {
  return {
    teamId: checkin.teamId,
    locationId: checkin.locationId,
    locationType: checkin.locationType,
    sessionToken: checkin.sessionToken,
    userId: checkin.userId,
    visitorName: checkin.visitorName,
    visitorEmail: checkin.visitorEmail,
    visitorPhone: checkin.visitorPhone,
    visitorGender: checkin.visitorGender,
    visitPurpose: checkin.visitPurpose,
    deviceId: checkin.deviceId,
    action: "out" as const,
    relatedLogId: checkin._id,
  };
}

/**
 * A log as the visitor's own browser may see it. ipAddress and userAgent are
 * captured for the audit trail and are not the visitor's to read back, and the
 * same body is what the idempotency cache replays.
 */
export function publicLog(log: any) {
  const o = typeof log?.toObject === "function" ? log.toObject() : { ...log };
  delete o.ipAddress;
  delete o.userAgent;
  return o;
}

/**
 * An Idempotency-Key is deterministic per session+location+day+action, so a
 * second visit that day presents the same key as the first. A cached response
 * is only a replay of *this* request if the log it describes is still the live
 * one; once that visit has been closed (or the check-out belongs to another
 * check-in) the key is stale and the request must be processed.
 */
export function cachedLogId(body: any): string | undefined {
  const l = body?.log ?? body;
  const id = l?._id ?? l?.id;
  return id ? String(id) : undefined;
}
