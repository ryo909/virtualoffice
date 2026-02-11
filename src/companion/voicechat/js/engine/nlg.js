import { renderTopicLine, SMALLTALK_MENU_LINES } from "./topics.js";

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)] || ""; }

function rhythmize(text){
  let s = String(text || "").trim();
  if (!s) return "…";

  const hasMenu = s.includes("\nA)") || s.includes("\n・");
  if (!hasMenu) {
    if (s.length > 110) s = s.slice(0, 106).trim() + "…";
    const parts = s.split("。").map(x=>x.trim()).filter(Boolean);
    if (parts.length >= 3) s = parts.slice(0,2).join("。") + "。";
  }

  // 質問符の連発を抑える（末尾の ? を1つに）
  s = s.replace(/[?？]{2,}/g, "？");

  return s.trim();
}

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

function slotQuestion(slot) {
  switch (slot) {
    case "taskName":
      return "いま何を進めたい感じ〜？（例：AIチャットの雑談改善 / バグ修正 みたいに一言でOK）";
    case "audience":
      return "誰向けにする〜？（例：自分用 / 社内デモ / チーム）";
    case "deadline":
      return "いつまでに欲しい〜？（例：今日 / 明日 / 今週 / 日付）";
    case "format":
      return "どんな形がいい〜？（例：箇条書き / 手順 / 指示文）";
    case "tone":
      return "語調どうする〜？（例：ゆるめ / 丁寧 / かため）";
    default:
      return "もうちょいだけ教えて〜。";
  }
}

export function renderCandidates(act, { state, parsed, effects }) {
  const prefix = String(effects?.memoryPrefix || "").trim();
  const p = prefix ? (prefix.endsWith("。") ? prefix : prefix + "。") : "";

  // --- short / noisy inputs
  if (act.kind === "EMPTY_NUDGE") return [
    "ん〜？（一言だけでも大丈夫だよ〜）",
    "おっ、呼んだ？（返事だけでもOK〜）",
    "んん、いまは『うん』だけでも成立するよ〜"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "LAUGH") return [
    "わかるw",
    "草ぁ。なんかツボった？",
    "それ、じわるやつ〜"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "CONFUSED") return [
    "ん？どこが引っかかった〜？（一語でOK）",
    "おけ、いったん整理するね。『何がわからん』だけ教えて〜",
    "大丈夫大丈夫。『どこまで分かった』かだけ言って〜"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "CHOICE_NUDGE") {
    const menu = extractABCMenu(state?.memory?.lastBot);
    if (menu) {
      const a = menu.A ? `A)${menu.A}` : "A)";
      const b = menu.B ? `B)${menu.B}` : "B)";
      const c = menu.C ? `C)${menu.C}` : "C)";
      return [
        `どれが近い?\n${a} ${b} ${c}\n（A/B/CだけでもOK）`,
        `A/B/Cどれにする〜？（一文字でいいよ）\n${a} ${b} ${c}`
      ].map((x) => rhythmize(p + x));
    }
    return [
      "A/B/Cのどれが近い〜？（AだけでもOK）",
      "どっち系？（A/B/Cの一文字でOK〜）"
    ].map((x) => rhythmize(p + x));
  }

  if (act.kind === "CHOICE_ACK") {
    const label = act.label ? `（${act.label}）` : "";
    return [
      `おっけー、${act.key}${label}ね〜。`,
      `了解〜！${act.key}${label}でいこ〜。`,
      `うんうん、${act.key}${label}に寄せよっか。`
    ].map((x) => rhythmize(p + x));
  }

  if (act.kind === "LONG_SHARE_PICK") {
    if (act.key === "A") return [
      "おけ〜。じゃあ要点だけ整えよ。『結論1行』だけ言って〜。",
      "要点整理いこ。いま一番大事なポイントってどれ？（一言でOK）"
    ].map((x) => rhythmize(p + x));
    if (act.key === "B") return [
      "次の一手いこ〜。いま最優先は何？（1つだけ）",
      "おっけ。じゃあ最短ルートで進めよ。次にやる作業名だけ教えて〜。"
    ].map((x) => rhythmize(p + x));
    return [
      "いいよ〜。愚痴ってOK。いま何がいちばんモヤる？",
      "うんうん、吐き出そ。どこで詰んだ感じ？"
    ].map((x) => rhythmize(p + x));
  }

  if (act.kind === "ACK_TINY") return [
    "うんうん。",
    "おけ〜。",
    "りょ〜。"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "ACK_YES") return [
    "おっけー！じゃあその方向でいこ〜。",
    "了解〜。そのまま進めよっか。"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "ACK_NO") return [
    "了解〜。じゃあ別ルートにしよ。",
    "おけ、違うのね。じゃあ他の案出す〜。"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "ACK_PROGRESS") return [
    "おっけ。続き、もうちょいだけ教えて〜。",
    "うんうん。で、いま一番気になるのどこ？",
    "了解〜。次どうする？"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "THANKS") return [
    "えへへ、どういたしまして〜。いつでも呼んでね。",
    "おっけー！役に立てたならうれしいよ〜。",
    "こちらこそありがと〜。また一緒にやろっか。"
  ].map(x=>rhythmize(p + x));

  if (act.kind === "GREET") return [
    "やあやあ〜。今日は何する？",
    "こんにちは〜！どこから進めよっか？",
    "おつかれさま〜。いまどんな感じ？"
  ].map(x=>rhythmize(p + x));

  if (act.kind === "COMFORT") return [
    "それはしんどいねぇ…。いまは休憩はさむ？それとも軽く整理する？",
    "よしよし…。いま一番きついのは「量」「締切」「内容」どれ？",
    "無理は禁物だよ〜。水分とって、ひと呼吸しよ？"
  ].map(x=>rhythmize(p + x));

  if (act.kind === "SMALLTALK_MENU") return SMALLTALK_MENU_LINES.map(x=>rhythmize(p + x));

  if (act.kind === "EXIT_CHECK") return [
    "そろそろ作業戻る〜？\nA)戻る B)もうちょい話す C)未定 どれ？",
    "いったん区切る？\nA)作業に戻る B)雑談つづける C)未定 どれにする？"
  ].map(x=>rhythmize(p + x));

  if (act.kind === "EXIT_ACK") return [
    "おっけー、じゃあ戻ろっか。今やる一手ってなに？",
    "いいね。作業モードいこ〜。次の一手だけ決めよ？"
  ].map(x=>rhythmize(p + x));

  if (act.kind === "LONG_SHARE_MENU") {
    const kw = parsed.keyword ? `「${parsed.keyword}」` : "要点";
    return [
      `なるほどねぇ。${kw}あたりが大事そう。\nA)要点だけ整理 B)次の一手 C)雑談に逃げる どれがいい？`,
      `うんうん。まずは軽く整えよ〜。\nA)短く要約 B)優先度つける C)いったん愚痴る どれ？`
    ].map(x=>rhythmize(p + x));
  }

  if (act.kind === "TOPIC_MOVE") {
    const lineA = renderTopicLine(act.topic, act.mode);
    const lineB = renderTopicLine(act.topic, act.mode);
    const lineC = renderTopicLine(act.topic, act.mode);
    return [lineA, lineB, lineC].filter(Boolean).map(x=>rhythmize(p + x));
  }

  if (act.kind === "CLARIFY") return [
    "おっけー！状況だけちょい聞かせて〜。誰向け/どんな場面の話？",
    "目的と相手を一言でいいから教えて〜。",
    "結論から作る？それとも状況整理からやる？どっちが楽かな？"
  ].map(x=>rhythmize(p + x));

  // task acts
  if (act.kind === "TASK_START") {
    return [
      "おっけー、タスク整理いこ〜。まず何を進めたい？（一言でOK）",
      "いいね。タスクモード入るよ〜。最初の作業名だけ教えて〜。"
    ].map((x) => rhythmize(p + x));
  }

  if (act.kind === "TASK_ASK_SLOT") {
    return [
      `${slotQuestion(act.slot)}`
    ].map(x=>rhythmize(p + x));
  }

  if (act.kind === "TASK_NEXT") {
    return [
      "おっけー。まずは「何をやるか」だけ決めよ〜。一言でOK！",
      "いいね。最初にやること、ざっくりでいいから教えて〜。"
    ].map(x=>rhythmize(p + x));
  }

  if (act.kind === "TASK_SUMMARY") {
    const s = state.slots || {};
    return [
      `まとまってきた〜。\n・やること：${s.taskName || "未定"}\n・向け先：${s.audience || "未定"}\n・期限：${s.deadline || "未定"}\n・形式：${s.format || "未定"}\n・語調：${s.tone || "未定"}\n\nA)次の一手を出す B)手順にする C)指示文にする どれにする？`
    ].map(x=>rhythmize(p + x));
  }

  // move群
  if (act.kind === "REFLECT") return [
    "うんうん、聞いてるよ〜。",
    "なるほどねぇ。",
    "それ、わかる…"
  ].map(x=>rhythmize(p + x));

  if (act.kind === "STORY_BAIT") return [
    "それでそれで〜？もうちょい聞かせて。",
    "お、続き気になる〜。そのあとどうなった？",
    "いいねぇ。そこ、もう少しだけ詳しく〜。"
  ].map(x=>rhythmize(p + x));

  if (act.kind === "MICRO_ADVICE") return [
    "いったん5分だけ区切って、一番軽い一手から行こ〜。",
    "いまは「小さく1つ」だけやるのが勝ちだよ〜。",
    "まずは優先度、上から1個だけ決めよ？"
  ].map(x=>rhythmize(p + x));

  if (act.kind === "CHEER") return [
    "それいいね〜！その調子その調子。",
    "やったじゃん〜。ちょっと誇っていいやつ。",
    "うんうん、進んでる感じする〜！"
  ].map(x=>rhythmize(p + x));

  if (act.kind === "OPEN") return [
    "うんうん、聞いてるよ〜。続けて〜。",
    "なるほどねぇ。次どうする？",
    "おっけー。いま一番気になるポイントどこ？"
  ].map(x=>rhythmize(p + x));

  return [rhythmize(p + "…")];
}
