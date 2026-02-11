import { step, proactive as engineProactive } from "./engine/index.js";
import { loadState, saveState, sanitizeState, initState } from "./engine/state.js";

export const defaultCharacter = "まるもち";

function isDebugEnabled() {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("companionDebug") === "1") return true;
    return localStorage.getItem("companion:debug") === "1";
  } catch {
    return false;
  }
}

export function getReply(text, state = {}) {
  const ctx = { character: state?.character || "", messages: state?.messages || [] };
  const res = step(text, ctx, initState());
  return res?.text || "";
}

export function reply(text, state = {}) {
  return getReply(text, state);
}

export class DialogueSystem {
  constructor(initialState = {}) {
    const stored = (typeof window !== "undefined" && window.localStorage) ? loadState() : initState();
    this.state = sanitizeState({ ...stored, ...(initialState || {}) });
    this.debug = isDebugEnabled();
  }

  setState(nextState = {}) {
    if (!nextState || typeof nextState !== "object") return this.state;
    this.state = sanitizeState({ ...this.state, ...nextState });
    try { saveState(this.state); } catch {}
    return this.state;
  }

  respond(text, statePatch = {}) {
    if (statePatch && typeof statePatch === "object") {
      // messages/character は ctx に渡す。その他は state の上書き対象（必要なら将来拡張）
    }

    const ctx = {
      character: statePatch?.character || "",
      messages: Array.isArray(statePatch?.messages) ? statePatch.messages : []
    };

    const res = step(text, ctx, this.state);
    this.state = sanitizeState(res.state);
    try { saveState(this.state); } catch {}
    if (this.debug) console.log("[DIALOGUE_V3]", res.meta);
    return { text: res.text, meta: res.meta };
  }

  proactive(statePatch = {}) {
    const ctx = {
      character: statePatch?.character || "",
      messages: Array.isArray(statePatch?.messages) ? statePatch.messages : []
    };

    const res = engineProactive(ctx, this.state);
    this.state = sanitizeState(res.state);
    try { saveState(this.state); } catch {}
    if (this.debug) console.log("[DIALOGUE_V3_PROACTIVE]", res.meta);
    return { text: res.text, meta: res.meta };
  }
}

export default { getReply, reply, defaultCharacter, DialogueSystem };
