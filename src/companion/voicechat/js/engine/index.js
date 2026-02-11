import { parseUserText } from "./nlu.js";
import { detectTopic } from "./topics.js";
import { initState, applyContextMessages, sanitizeState, firstMissingSlot, setPending, clearPending } from "./state.js";
import { decideAct } from "./policy.js";
import { renderCandidates } from "./nlg.js";
import { pickNonRepeating, rememberReply } from "./repetition.js";

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

function isQuestionText(t){
  const s = String(t || "").trim();
  return /[?？]\s*$/.test(s) || s.includes("\nA)");
}

function makeId(){
  return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function decayMiniMemory(state){
  state.miniMemory.items = state.miniMemory.items
    .map((it)=> ({...it, ttl: Math.max(0, (it.ttl||0) - 1)}))
    .filter((it)=> it.ttl > 0 && !it.used);
}

function addMiniMemory(state, topicId, value){
  const v = String(value || "").trim();
  if (!topicId || !v) return;

  const existing = state.miniMemory.items.find((x)=> x.topicId === topicId && !x.used);
  if (existing) {
    existing.value = v.slice(0,40);
    existing.ttl = 6;
    existing.addedTurn = state.turn;
    return;
  }

  const item = { id: makeId(), topicId, value: v.slice(0,40), ttl: 6, used: false, addedTurn: state.turn };
  state.miniMemory.items = [item, ...state.miniMemory.items].slice(0,3);
}

function takeMemoryPrefix(state, topicId){
  if (!topicId) return "";
  const it = state.miniMemory.items.find((x)=> x.topicId === topicId && !x.used);
  if (!it) return "";
  if ((state.turn - it.addedTurn) > 4) return "";
  it.used = true;
  return `そういえばさっき「${it.value}」って言ってたよね〜`;
}

function applySlotHints(state, hints){
  if (!hints) return;
  const s = state.slots;

  if (!s.taskName && hints.taskName) s.taskName = hints.taskName;
  if (!s.audience && hints.audience) s.audience = hints.audience;
  if (!s.deadline && hints.deadline) s.deadline = hints.deadline;
  if (!s.format && hints.format) s.format = hints.format;
  if (!s.tone && hints.tone) s.tone = hints.tone;
}

function tryFillPendingSlot(state, parsed){
  if (state.mode !== "task") return;

  const pending = state.pending;
  if (!pending?.slot) return;

  // 雑談/挨拶系は slot fill しない
  if (["greet","thanks","smalltalk","return_work","empty"].includes(parsed.intent)) return;

  const val = String(parsed.clean || "").trim();
  if (!val) return;

  // 「未定」「わからない」系はそのまま格納して前に進む
  const normalized = /(未定|わから|あとで|後で)/.test(val) ? "未定" : val.slice(0, 60);

  state.slots[pending.slot] = normalized;
  clearPending(state);
}

function ensurePendingForNextMissing(state){
  if (state.mode !== "task") return;
  const missing = firstMissingSlot(state);
  if (missing) setPending(state, missing);
}

export function step(userText, ctx = {}, prevState = null){
  const base = prevState ? clone(prevState) : initState();
  applyContextMessages(base, ctx.messages);

  const parsed = parseUserText(userText);
  parsed.topic = detectTopic(parsed.clean);

  base.memory.lastUser = parsed.clean;

  // mood update
  if (parsed.mood && parsed.mood !== "neutral") base.mood = parsed.mood;

  // mode switch triggers
  if (parsed.intent === "task_request") base.mode = "task";
  if (parsed.intent === "return_work") base.mode = "task"; // 戻る=作業側へ寄せる
  if (parsed.intent === "smalltalk") base.mode = "chat";   // 明示雑談

  // topic update
  if (parsed.topic) base.topic.current = { ...parsed.topic, updatedAt: Date.now() };

  // smalltalk counter
  const countsAsSmalltalk = ["share","other","ack","question","smalltalk"].includes(parsed.intent);
  if (base.mode === "chat" && countsAsSmalltalk) base.chat.smalltalkTurns += 1;
  if (base.mode === "task") base.chat.smalltalkTurns = 0;

  // slot hints apply（task modeのみ）
  if (base.mode === "task") applySlotHints(base, parsed.slotsHint);

  // pending slot fill
  tryFillPendingSlot(base, parsed);
  if (base.mode === "task") ensurePendingForNextMissing(base);

  // miniMemory（share + topic）
  if (parsed.intent === "share" && parsed.topic) addMiniMemory(base, parsed.topic.id, parsed.keyword || parsed.clean.slice(0,16));

  // act decide
  const act = decideAct({ state: base, parsed });

  if (act.kind === "EXIT_CHECK") base.chat.exitOfferedTurn = base.turn;

  // topic ask bookkeeping
  if (act.kind === "TOPIC_MOVE" && (act.mode === "ask" || act.mode === "choice")) {
    base.topic.lastAskTurn = base.turn;
    if ((base.turn - base.topic.askCountWindowStartTurn) > 10) {
      base.topic.askCountWindowStartTurn = base.turn;
      base.topic.askCountInWindow = 0;
    }
    base.topic.askCountInWindow += 1;
  }

  // memory prefix
  const effects = {};
  if (act.kind === "TOPIC_MOVE" && act.topic?.id) effects.memoryPrefix = takeMemoryPrefix(base, act.topic.id);

  const candidates = renderCandidates(act, { state: base, parsed, effects });
  const text = pickNonRepeating(candidates, base);

  // question streak
  const asked = isQuestionText(text);
  base.chat.questionStreak = asked ? (Number(base.chat.questionStreak)||0) + 1 : 0;

  // decay miniMemory
  decayMiniMemory(base);

  // finalize
  base.turn += 1;
  base.updatedAt = Date.now();
  base.memory.lastIntent = parsed.intent;
  base.memory.lastAct = act.kind;
  base.memory.lastBot = text;
  rememberReply(base, text);

  const meta = {
    intent: parsed.intent,
    act: act.kind,
    mode: base.mode,
    topic: parsed.topic,
    mood: base.mood,
    questionStreak: base.chat.questionStreak,
    smalltalkTurns: base.chat.smalltalkTurns
  };

  return { text, state: sanitizeState(base), meta };
}

export function proactive(ctx = {}, prevState = null){
  const base = prevState ? clone(prevState) : initState();
  applyContextMessages(base, ctx.messages);

  // ゆるい一言：疲れてる→労い / topicあり→コメント / それ以外→雑談or作業戻る
  let act = { kind:"OPEN" };
  if (base.mood === "tired") act = { kind:"COMFORT" };
  else if (base.topic.current) act = { kind:"TOPIC_MOVE", topic: base.topic.current, mode:"comment" };
  else act = { kind:"EXIT_CHECK" };

  const parsed = { intent:"other", mood: base.mood, keyword:"", topic: base.topic.current, lenBucket:"mid" };
  const candidates = renderCandidates(act, { state: base, parsed, effects:{} });
  const text = pickNonRepeating(candidates, base);

  base.turn += 1;
  base.updatedAt = Date.now();
  base.memory.lastAct = act.kind;
  base.memory.lastBot = text;
  rememberReply(base, text);

  return { text, state: sanitizeState(base), meta: { act: act.kind } };
}
