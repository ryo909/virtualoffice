function parseChoiceKey(choice) {
  const key = String(choice?.key || "").toUpperCase();
  return ["A", "B", "C", "DEIXIS"].includes(key) ? key : "";
}

export function decideAct({ state, parsed }) {
  const intent = parsed?.intent || "other";
  const inputType = parsed?.inputType || "text";
  const shortStreak = Number(state?.chat?.shortStreak) || 0;

  // 0) slot fill は最優先
  if (state.mode === "task" && state.pending?.type === "slot_fill" && state.pending.slot) {
    return { kind: "TASK_ASK_SLOT", slot: state.pending.slot };
  }

  // 1) expect を優先処理（lastBot解析には依存しない）
  const expect = state?.expect;
  if (expect?.type === "choice") {
    const key = parseChoiceKey(parsed?.choice);
    const source = String(expect?.meta?.source || "");
    const options = expect?.options || {};

    if (["A", "B", "C"].includes(key)) {
      if (source === "exit_check") {
        if (key === "A") return { kind: "EXIT_ACK" };
        if (key === "B") return { kind: "OPEN" };
        return { kind: "REFLECT" };
      }
      if (source === "long_share") return { kind: "LONG_SHARE_PICK", key, label: options[key] || "" };
      if (source === "dev_triage") return { kind: "DEV_TRIAGE_PICK", key, label: options[key] || "" };
      if (source === "url_clarify") return { kind: "URL_CLARIFY_PICK", key, label: options[key] || "" };
      if (source === "list_summary") return { kind: "LIST_SUMMARY_PICK", key, label: options[key] || "" };
      return { kind: "CHOICE_PICK", key, label: options[key] || "" };
    }

    if (key === "DEIXIS" || intent === "ack") return { kind: "CHOICE_NUDGE" };
    return { kind: "CHOICE_NUDGE" };
  }

  if (expect?.type === "yesno") {
    if (parsed?.yesNo === "yes" || parsed?.yesNo === "no") return { kind: "YESNO_PICK", value: parsed.yesNo };
    if (intent === "ack") return { kind: "YESNO_PICK", value: "yes" };
    return { kind: "YESNO_NUDGE" };
  }

  if (expect?.type === "freeText" || expect?.type === "clarify") {
    if (intent === "confused") return { kind: "REPAIR_REPHRASE" };
    if (intent === "empty") return { kind: "REPAIR_SUMMARY" };
    return { kind: "CLARIFY_ONE" };
  }

  // 2) ノイズ系
  if (intent === "empty") return { kind: "EMPTY_NUDGE" };
  if (intent === "laugh") return { kind: "LAUGH" };
  if (intent === "confused") return { kind: "CONFUSED" };

  // 3) 固定系
  if (intent === "thanks") return { kind: "THANKS" };
  if (intent === "greet") return { kind: "GREET" };
  if (intent === "tired") return { kind: "COMFORT" };
  if (intent === "smalltalk") return { kind: "SMALLTALK_MENU" };
  if (intent === "return_work") return { kind: "EXIT_ACK" };
  if (intent === "task_request") return { kind: "TASK_START" };

  // 4) task mode
  if (state.mode === "task") {
    const allFilled = Object.values(state.slots || {}).every((v) => String(v || "").trim());
    if (allFilled) return { kind: "TASK_SUMMARY" };
    if (state.pending?.slot) return { kind: "TASK_ASK_SLOT", slot: state.pending.slot };
    return { kind: "TASK_NEXT" };
  }

  // 5) 入力タイプ別の次の一手
  if (inputType === "log" || inputType === "code") return { kind: "DEV_TRIAGE_MENU" };
  if (inputType === "url") return { kind: "URL_CLARIFY" };
  if (inputType === "list") return { kind: "LIST_SUMMARY_MENU" };

  // 6) 長文
  if (state.mode === "chat" && parsed.lenBucket === "long" && intent !== "question") {
    return { kind: "LONG_SHARE_MENU" };
  }

  // 7) topic move
  if (parsed.topic) {
    const askedRecently = (state.turn - state.topic.lastAskTurn) <= 3;
    const qStreak = Number(state.chat?.questionStreak) || 0;
    const inWindow = (state.turn - state.topic.askCountWindowStartTurn) <= 10;
    const tooManyInWindow = inWindow && state.topic.askCountInWindow >= 2;

    const shouldAvoidQuestion = (qStreak >= 2) || askedRecently || tooManyInWindow || (state.mood === "tired") || (shortStreak >= 2);
    if (shouldAvoidQuestion) return { kind: "TOPIC_MOVE", topic: parsed.topic, mode: "comment" };

    const mode = (Math.random() < 0.42) ? "choice" : "ask";
    return { kind: "TOPIC_MOVE", topic: parsed.topic, mode };
  }

  // 8) 質問/相槌
  if (intent === "question") return { kind: "CLARIFY" };

  if (intent === "ack") {
    if (shortStreak >= 2) return { kind: "ACK_TINY" };
    return { kind: "ACK_PROGRESS" };
  }

  if (intent === "choice") return { kind: "CHOICE_NUDGE" };
  if (intent === "share") return { kind: "STORY_BAIT" };

  // 9) 雑談出口
  const canOfferExit =
    (state.mode === "chat") &&
    (Number(state.chat?.smalltalkTurns) || 0) >= 3 &&
    (state.turn - (Number(state.chat?.exitOfferedTurn) || -999)) >= 6;
  if (canOfferExit && Math.random() < 0.22) return { kind: "EXIT_CHECK" };

  if (state.mood === "busy") return { kind: "MICRO_ADVICE" };
  if (state.mood === "happy") return { kind: "CHEER" };

  return { kind: "OPEN" };
}
