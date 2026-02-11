const PUNCT_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~、。！？「」『』（）［］【】・…〜～]/g;

function norm(text) {
  return String(text ?? "").toLowerCase().replace(PUNCT_RE, "").replace(/\s+/g, "").trim();
}

export function pickNonRepeating(candidates, state) {
  const list = Array.isArray(candidates) ? candidates.map((s) => String(s || "").trim()).filter(Boolean) : [];
  if (!list.length) return "…";
  const recent = Array.isArray(state?.memory?.recentBotReplies) ? state.memory.recentBotReplies : [];
  const recentNorm = new Set(recent.map(norm));
  for (const c of list) if (!recentNorm.has(norm(c))) return c;
  return list[0];
}

export function rememberReply(state, text) {
  const t = String(text || "").trim();
  if (!t) return state;
  const arr = Array.isArray(state.memory.recentBotReplies) ? state.memory.recentBotReplies : [];
  state.memory.recentBotReplies = [...arr, t].slice(-10);
  return state;
}
