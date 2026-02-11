export function decideAct({ state, parsed }) {
  const intent = parsed.intent;

  // 0) pending slot が残っているなら最優先で聞く
  if (state.mode === "task" && state.pending?.type === "slot_fill" && state.pending.slot) {
    return { kind: "TASK_ASK_SLOT", slot: state.pending.slot };
  }

  // 1) 固定系
  if (intent === "thanks") return { kind: "THANKS" };
  if (intent === "greet") return { kind: "GREET" };
  if (intent === "tired") return { kind: "COMFORT" };
  if (intent === "smalltalk") return { kind: "SMALLTALK_MENU" };
  if (intent === "return_work") return { kind: "EXIT_ACK" };

  // 2) task request が来たら task modeへ誘導（state側でmode切替済み想定）
  if (state.mode === "task") {
    // slot が埋まっていればサマリ/次へ
    const allFilled = Object.values(state.slots || {}).every((v) => String(v || "").trim());
    if (allFilled) return { kind: "TASK_SUMMARY" };

    // まだ足りないなら次の質問（pending設定済み想定）
    if (state.pending?.slot) return { kind: "TASK_ASK_SLOT", slot: state.pending.slot };

    return { kind: "TASK_NEXT" };
  }

  // 3) 雑談の出口（雑談が続いたら、たまに提案）
  const canOfferExit = state.mode === "chat"
    && state.chat.smalltalkTurns >= 3
    && (state.turn - state.chat.exitOfferedTurn) >= 6;

  if (canOfferExit && Math.random() < 0.25) {
    return { kind: "EXIT_CHECK" };
  }

  // 4) 長文は“整理の提案”
  if (parsed.lenBucket === "long") return { kind: "LONG_SHARE_MENU" };

  // 5) topic があるなら拾う（質問連発/追撃を抑制）
  if (parsed.topic) {
    const sameTopic = state.topic.current?.id === parsed.topic.id;
    const askedRecently = sameTopic && (state.turn - state.topic.lastAskTurn) <= 2;
    const qStreak = Number(state.chat.questionStreak) || 0;

    const inWindow = (state.turn - state.topic.askCountWindowStartTurn) <= 10;
    const tooManyInWindow = inWindow && state.topic.askCountInWindow >= 2;

    const shouldAvoidQuestion = (qStreak >= 2) || askedRecently || tooManyInWindow || (state.mood === "tired");
    if (shouldAvoidQuestion) return { kind: "TOPIC_MOVE", topic: parsed.topic, mode: "comment" };

    const mode = (Math.random() < 0.35) ? "choice" : "ask";
    return { kind: "TOPIC_MOVE", topic: parsed.topic, mode };
  }

  // 6) 質問なら“1問だけ”で受ける
  if (intent === "question") return { kind: "CLARIFY" };

  // 7) share/ack/other はムーブで返す
  if (intent === "ack") return { kind: "REFLECT" };
  if (intent === "share") return { kind: "STORY_BAIT" };

  if (state.mood === "busy") return { kind: "MICRO_ADVICE" };
  if (state.mood === "happy") return { kind: "CHEER" };

  return { kind: "OPEN" };
}
