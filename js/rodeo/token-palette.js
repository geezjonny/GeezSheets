// Pure helpers for the Build > Token palette. No DOM, Firebase, or VTT state.
export const tokenInitials = (name = "?") => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

export const recentTokenRefs = (refs, available, limit = 5) => {
  const have = new Set(available.map((token) => `${token.kind}:${token.id}`));
  return [...new Set(refs)].filter((ref) => have.has(ref)).slice(0, limit);
};
