function hasABCMenu(text) {
  const s = String(text || "");
  return s.includes("\nA)") && s.includes("B)") && s.includes("C)");
}

function extractABCMenu(text) {
  const s = String(text || "");
  if (!hasABCMenu(s)) return null;

  const posA = s.indexOf("A)");
  const posB = s.indexOf("B)");
  const posC = s.indexOf("C)");
  const end = s.length;

  const cut = (from, to) => {
    if (from < 0) return "";
    const start = from + 2;
    const stop = (to > start) ? to : end;
    return s.slice(start, stop).replace(/\s+/g, " ").trim().slice(0, 40);
  };

  const A = cut(posA, posB >= 0 ? posB : (posC >= 0 ? posC : end));
  const B = cut(posB, posC >= 0 ? posC : end);
  const C = cut(posC, end);
  if (!A && !B && !C) return null;
  return { A, B, C };
}

function lastBotIsQuestion(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (hasABCMenu(s)) return true;
  return /[?？]\s*$/.test(s);
}

export function decideAct({ state, parsed }) {
  const intent = parsed.intent;

  const lastAct = String(state.memory?.lastAct || "");
  const lastBot = String(state.memory?.lastBot || "");
  const menu = extractABCMenu(lastBot);

  // 0) pending slot が残っているなら最優先で聞く
  if (state.mode === "task" && state.pending?.type === "slot_fill" && state.pending.slot) {
    return { kind: "TASK_ASK_SLOT", slot: state.pending.slot };
  }

  // 0.5) 無言/ノイズを先に拾う
  if (intent === "empty") return { kind: "EMPTY_NUDGE" };
  if (intent === "laugh") return { kind: "LAUGH" };
  if (intent === "confused") return { kind: "CONFUSED" };

  // 1) 固定系
  if (intent === "thanks") return { kind: "THANKS" };
  if (intent === "greet") return { kind: "GREET" };
  if (intent === "tired") return { kind: "COMFORT" };
  if (intent === "smalltalk") return { kind: "SMALLTALK_MENU" };
  if (intent === "return_work") return { kind: "EXIT_ACK" };
  if (intent === "task_request") return { kind: "TASK_START" };

  // 2) A/B/C の選択入力
  if (intent === "choice" && parsed.choice) {
    const key = parsed.choice.key;

    if (key === "DEIXIS" && menu) return { kind: "CHOICE_NUDGE" };

    if (lastAct === "EXIT_CHECK") {
      if (key === "A") return { kind: "EXIT_ACK" };
      if (key === "B") return { kind: "OPEN" };
      return { kind: "REFLECT" };
    }

    if (lastAct === "LONG_SHARE_MENU") return { kind: "LONG_SHARE_PICK", key };

    if (lastAct === "TOPIC_MOVE" && menu && ["A", "B", "C"].includes(key)) {
      return { kind: "CHOICE_ACK", key, label: menu[key] || "" };
    }

    if (lastAct === "TASK_SUMMARY" && menu && ["A", "B", "C"].includes(key)) {
      return { kind: "CHOICE_ACK", key, label: menu[key] || "" };
    }

    if (menu && ["A", "B", "C"].includes(key)) return { kind: "CHOICE_ACK", key, label: menu[key] || "" };
    return { kind: "REFLECT" };
  }

  // 3) task mode（slot/pending を維持）
  if (state.mode === "task") {
    const allFilled = Object.values(state.slots || {}).every((v) => String(v || "").trim());
    if (allFilled) return { kind: "TASK_SUMMARY" };
    if (state.pending?.slot) return { kind: "TASK_ASK_SLOT", slot: state.pending.slot };
    return { kind: "TASK_NEXT" };
  }

  // 4) 長文はメニューで圧を下げる
  if (state.mode === "chat" && parsed.lenBucket === "long" && intent !== "question") {
    return { kind: "LONG_SHARE_MENU" };
  }

  // 5) topic があるなら拾う
  if (parsed.topic) {
    const askedRecently = (state.turn - state.topic.lastAskTurn) <= 3;
    const qStreak = Number(state.chat?.questionStreak) || 0;
    const shortStreak = Number(state.chat?.shortStreak) || 0;

    const inWindow = (state.turn - state.topic.askCountWindowStartTurn) <= 10;
    const tooManyInWindow = inWindow && state.topic.askCountInWindow >= 2;

    const shouldAvoidQuestion = (qStreak >= 2) || askedRecently || tooManyInWindow || (state.mood === "tired") || (shortStreak >= 2);
    if (shouldAvoidQuestion) return { kind: "TOPIC_MOVE", topic: parsed.topic, mode: "comment" };

    const mode = (Math.random() < 0.42) ? "choice" : "ask";
    return { kind: "TOPIC_MOVE", topic: parsed.topic, mode };
  }

  // 6) 質問なら1問で返す
  if (intent === "question") return { kind: "CLARIFY" };

  // 7) ack は止まらない返しにする
  if (intent === "ack") {
    if (menu) return { kind: "CHOICE_NUDGE" };

    const wasQ = lastBotIsQuestion(lastBot);
    if (wasQ) {
      if (parsed.yesNo === "yes") return { kind: "ACK_YES" };
      if (parsed.yesNo === "no") return { kind: "ACK_NO" };
      return { kind: "ACK_PROGRESS" };
    }

    if ((Number(state.chat?.shortStreak) || 0) >= 2) return { kind: "ACK_TINY" };
    return { kind: "ACK_PROGRESS" };
  }

  // 8) その他
  if (intent === "share") return { kind: "STORY_BAIT" };

  const canOfferExit =
    (state.mode === "chat") &&
    (Number(state.chat?.smalltalkTurns) || 0) >= 3 &&
    (state.turn - (Number(state.chat?.exitOfferedTurn) || -999)) >= 6;

  if (canOfferExit && Math.random() < 0.22) return { kind: "EXIT_CHECK" };

  if (state.mood === "busy") return { kind: "MICRO_ADVICE" };
  if (state.mood === "happy") return { kind: "CHEER" };

  return { kind: "OPEN" };
}
