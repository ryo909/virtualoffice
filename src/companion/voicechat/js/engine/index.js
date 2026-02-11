import { parseUserText, enhanceParsedWithExpect } from "./nlu.js";
import { detectTopic, getTopicChoiceOptions } from "./topics.js";
import {
  initState,
  applyContextMessages,
  sanitizeState,
  firstMissingSlot,
  setPending,
  clearPending,
  setExpect,
  clearExpect,
  decayExpect
} from "./state.js";
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
  if (["greet","thanks","smalltalk","return_work","empty","ack","choice","laugh","confused"].includes(parsed.intent)) return;

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

function shouldForceDevTopic(inputType) {
  return ["log", "code", "url", "list"].includes(String(inputType || ""));
}

function updateExpectFromAct(state, act) {
  const kind = String(act?.kind || "");

  if ([
    "CHOICE_PICK", "CHOICE_ACK", "LONG_SHARE_PICK", "DEV_TRIAGE_PICK", "URL_CLARIFY_PICK",
    "LIST_SUMMARY_PICK", "YESNO_PICK", "EXIT_ACK", "TASK_START", "TASK_ASK_SLOT"
  ].includes(kind)) {
    clearExpect(state);
    return;
  }

  if (kind === "TOPIC_MOVE" && act.mode === "choice") {
    setExpect(state, {
      type: "choice",
      options: getTopicChoiceOptions(act.topic?.id),
      ttl: 3,
      meta: { source: "topic_choice", topicId: String(act.topic?.id || "") }
    });
    return;
  }

  if (kind === "EXIT_CHECK") {
    setExpect(state, {
      type: "choice",
      options: { A: "戻る", B: "雑談つづける", C: "未定" },
      ttl: 3,
      meta: { source: "exit_check" }
    });
    return;
  }

  if (kind === "LONG_SHARE_MENU") {
    setExpect(state, {
      type: "choice",
      options: { A: "要点整理", B: "次の一手", C: "共感だけ" },
      ttl: 3,
      meta: { source: "long_share" }
    });
    return;
  }

  if (kind === "DEV_TRIAGE_MENU") {
    setExpect(state, {
      type: "choice",
      options: { A: "症状", B: "ログ", C: "再現手順" },
      ttl: 3,
      meta: { source: "dev_triage", topicId: "dev" }
    });
    return;
  }

  if (kind === "URL_CLARIFY") {
    setExpect(state, {
      type: "choice",
      options: { A: "やりたいこと", B: "対象ページ", C: "エラー有無" },
      ttl: 3,
      meta: { source: "url_clarify" }
    });
    return;
  }

  if (kind === "LIST_SUMMARY_MENU") {
    setExpect(state, {
      type: "choice",
      options: { A: "優先度付け", B: "要点1行", C: "次の一手" },
      ttl: 3,
      meta: { source: "list_summary" }
    });
    return;
  }

  if (kind === "TASK_SUMMARY") {
    setExpect(state, {
      type: "choice",
      options: { A: "次の一手", B: "手順化", C: "指示文化" },
      ttl: 3,
      meta: { source: "task_summary", allowInTask: true }
    });
    return;
  }

  if (kind === "YESNO_NUDGE") {
    setExpect(state, { type: "yesno", ttl: 2, meta: { source: "yesno_nudge" } });
    return;
  }

  if (["CLARIFY", "CLARIFY_ONE"].includes(kind)) {
    setExpect(state, { type: "freeText", ttl: 2, meta: { source: "clarify" } });
    return;
  }

  if (["CONFUSED", "REPAIR_REPHRASE", "REPAIR_SUMMARY"].includes(kind)) {
    setExpect(state, { type: "clarify", ttl: 2, meta: { source: "repair" } });
    return;
  }
}

export function step(userText, ctx = {}, prevState = null){
  const base = prevState ? clone(prevState) : initState();
  applyContextMessages(base, ctx.messages);
  decayExpect(base);

  let parsed = parseUserText(userText);
  parsed = enhanceParsedWithExpect(parsed, base);
  parsed.topic = detectTopic(parsed.clean);
  if (shouldForceDevTopic(parsed.inputType)) {
    parsed.topic = { id: "dev", label: "開発" };
  }

  base.memory.lastUser = parsed.clean;

  // mood update
  if (parsed.mood && parsed.mood !== "neutral") base.mood = parsed.mood;

  // mode switch triggers
  if (parsed.intent === "task_request") base.mode = "task";
  if (parsed.intent === "return_work") base.mode = "task"; // 戻る=作業側へ寄せる
  if (parsed.intent === "smalltalk") base.mode = "chat";   // 明示雑談

  // 明確な文脈転換時は expect を解除
  if (["task_request", "return_work"].includes(parsed.intent)) clearExpect(base);
  if (parsed.intent === "share" && parsed.lenBucket === "long") clearExpect(base);
  if (base.expect && shouldForceDevTopic(parsed.inputType) && !["choice", "ack"].includes(parsed.intent)) clearExpect(base);
  if (base.mode === "task" && base.expect && !base.expect.meta?.allowInTask) clearExpect(base);

  // topic update
  if (parsed.topic) base.topic.current = { ...parsed.topic, updatedAt: Date.now() };

  // smalltalk counter
  const countsAsSmalltalk = ["share","other","ack","question","smalltalk","choice","laugh","confused"].includes(parsed.intent);
  if (base.mode === "chat" && countsAsSmalltalk) base.chat.smalltalkTurns += 1;
  if (base.mode === "task") base.chat.smalltalkTurns = 0;

  // short streak: 短文が続く時は返答圧を下げる
  const shortish = (parsed.lenBucket === "short") && ["ack","choice","laugh","confused","other","empty"].includes(parsed.intent);
  base.chat.shortStreak = shortish ? (Number(base.chat.shortStreak) || 0) + 1 : 0;

  // slot hints apply（task modeのみ）
  if (base.mode === "task") applySlotHints(base, parsed.slotsHint);

  // pending slot fill
  tryFillPendingSlot(base, parsed);
  if (base.mode === "task") ensurePendingForNextMissing(base);

  // miniMemory（share + topic）
  if (parsed.intent === "share" && parsed.topic) addMiniMemory(base, parsed.topic.id, parsed.keyword || parsed.clean.slice(0,16));

  // act decide
  const act = decideAct({ state: base, parsed });

  // act が『作業に戻る』を確定したら mode も切り替える（choice A など）
  if (act.kind === "EXIT_ACK") base.mode = "task";

  updateExpectFromAct(base, act);

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
    inputType: parsed.inputType,
    mood: base.mood,
    questionStreak: base.chat.questionStreak,
    shortStreak: base.chat.shortStreak,
    smalltalkTurns: base.chat.smalltalkTurns,
    expect: base.expect ? { ...base.expect } : null
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
