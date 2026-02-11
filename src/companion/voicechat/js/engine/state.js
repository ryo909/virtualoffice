export const ENGINE_STATE_VERSION = 3;
export const STORAGE_KEY = "companion:dialogueState:v3";

export const TASK_SLOT_FLOW = ["taskName", "audience", "deadline", "format", "tone"];

export function initState(now = Date.now()) {
  return {
    version: ENGINE_STATE_VERSION,
    turn: 0,

    // mode: chat | task | comfort
    mode: "chat",

    // task slots
    pending: null, // { type:'slot_fill', slot, askedAt, tries }
    slots: {
      taskName: "",
      audience: "",
      deadline: "",
      format: "",
      tone: ""
    },

    // smalltalk enhancements
    mood: "neutral", // neutral | tired | happy | busy
    chat: {
      questionStreak: 0,
      smalltalkTurns: 0,
      exitOfferedTurn: -999
    },
    topic: {
      current: null,            // {id,label,updatedAt}
      lastAskTurn: -999,
      askCountWindowStartTurn: 0,
      askCountInWindow: 0
    },
    miniMemory: {
      items: [] // max 3: {id, topicId, value, ttl, used, addedTurn}
    },

    memory: {
      lastUser: "",
      lastBot: "",
      recentBotReplies: [],
      lastIntent: "",
      lastAct: ""
    },

    updatedAt: now
  };
}

function asStr(x) { return typeof x === "string" ? x : ""; }

function normalizeRecent(list) {
  if (!Array.isArray(list)) return [];
  return list.map((s) => asStr(s).trim()).filter(Boolean).slice(-10);
}

export function sanitizeState(obj) {
  const base = initState();
  const s = (obj && typeof obj === "object") ? obj : {};

  const state = {
    ...base,
    version: ENGINE_STATE_VERSION,
    turn: Number(s.turn) || 0,
    mode: (s.mode === "task" || s.mode === "comfort") ? s.mode : "chat",
    pending: null,
    slots: {
      taskName: asStr(s.slots?.taskName),
      audience: asStr(s.slots?.audience),
      deadline: asStr(s.slots?.deadline),
      format: asStr(s.slots?.format),
      tone: asStr(s.slots?.tone)
    },
    mood: (["neutral","tired","happy","busy"].includes(s.mood)) ? s.mood : "neutral",
    chat: {
      questionStreak: Number(s.chat?.questionStreak) || 0,
      smalltalkTurns: Number(s.chat?.smalltalkTurns) || 0,
      exitOfferedTurn: Number(s.chat?.exitOfferedTurn) || -999
    },
    topic: {
      current: (s.topic?.current && typeof s.topic.current === "object" && s.topic.current.id)
        ? { id: String(s.topic.current.id), label: String(s.topic.current.label || ""), updatedAt: Number(s.topic.current.updatedAt) || 0 }
        : null,
      lastAskTurn: Number(s.topic?.lastAskTurn) || -999,
      askCountWindowStartTurn: Number(s.topic?.askCountWindowStartTurn) || 0,
      askCountInWindow: Number(s.topic?.askCountInWindow) || 0
    },
    miniMemory: {
      items: Array.isArray(s.miniMemory?.items) ? s.miniMemory.items.slice(0, 3).map((it) => ({
        id: String(it?.id || ""),
        topicId: String(it?.topicId || ""),
        value: String(it?.value || "").slice(0, 40),
        ttl: Math.max(0, Number(it?.ttl) || 0),
        used: Boolean(it?.used),
        addedTurn: Number(it?.addedTurn) || 0
      })).filter((it) => it.id && it.topicId && it.value) : []
    },
    memory: {
      lastUser: asStr(s.memory?.lastUser),
      lastBot: asStr(s.memory?.lastBot),
      recentBotReplies: normalizeRecent(s.memory?.recentBotReplies),
      lastIntent: asStr(s.memory?.lastIntent),
      lastAct: asStr(s.memory?.lastAct)
    },
    updatedAt: Number(s.updatedAt) || Date.now()
  };

  if (s.pending && typeof s.pending === "object" && s.pending.slot) {
    state.pending = {
      type: "slot_fill",
      slot: String(s.pending.slot),
      askedAt: Number(s.pending.askedAt) || Date.now(),
      tries: Number(s.pending.tries) || 0
    };
  }

  return state;
}

export function loadState(storageKey = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return initState();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return initState();
  }
}

export function saveState(state, storageKey = STORAGE_KEY) {
  try { localStorage.setItem(storageKey, JSON.stringify(sanitizeState(state))); } catch {}
}

export function firstMissingSlot(state, flow = TASK_SLOT_FLOW) {
  for (const slot of flow) {
    if (!String(state?.slots?.[slot] || "").trim()) return slot;
  }
  return "";
}

export function setPending(state, slot) {
  if (!slot) return state;
  state.pending = { type: "slot_fill", slot, askedAt: Date.now(), tries: 0 };
  return state;
}

export function clearPending(state) {
  state.pending = null;
  return state;
}

export function applyContextMessages(state, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return state;

  if (!state.memory.lastUser) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === "user" && typeof m.text === "string" && m.text.trim()) { state.memory.lastUser = m.text.trim(); break; }
    }
  }
  if (!state.memory.lastBot) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === "assistant" && typeof m.text === "string" && m.text.trim()) { state.memory.lastBot = m.text.trim(); break; }
    }
  }
  return state;
}
