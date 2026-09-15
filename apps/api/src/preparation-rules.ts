export function documentState(
  item: {
    document_id: string | null;
    state: string;
    expires_at?: string | null;
    review_version?: string | null;
  },
  version: string,
  now = Date.now(),
) {
  if (!item.document_id) return "MISSING";
  if (item.expires_at && new Date(item.expires_at).getTime() <= now)
    return "UPDATE";
  if (item.state === "REVIEWED" && item.review_version !== version)
    return "UPDATE";
  return item.state === "MISSING" ? "LINKED" : item.state;
}
