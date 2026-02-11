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

function expectChoiceText(state) {
  const opt = state?.expect?.options || {};
  const a = String(opt.A || "").trim();
  const b = String(opt.B || "").trim();
  const c = String(opt.C || "").trim();
  if (!a && !b && !c) return null;
  return { a, b, c };
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
  const lowPressure = (Number(state?.chat?.shortStreak) || 0) >= 2;

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
    const choiceText = expectChoiceText(state);
    if (!choiceText) {
      return [
        "A/B/Cどれにする〜？（一文字でOK）",
        "どれが近い〜？A/B/Cで教えて〜。",
        "迷ったらAかBかCだけ送って〜。"
      ].map((x) => rhythmize(p + x));
    }
    const { a, b, c } = choiceText;
    return [
      `A/B/Cどれにする〜？（一文字でOK）\nA)${a} B)${b} C)${c}`,
      `どれが近い〜？\nA)${a} B)${b} C)${c}\n（A/B/Cだけ送ってもOK）`,
      `迷ったらA/B/Cだけで大丈夫〜。\nA)${a} B)${b} C)${c}`
    ].map((x) => rhythmize(p + x));
  }

  if (act.kind === "CHOICE_PICK" || act.kind === "CHOICE_ACK") {
    const label = act.label ? `（${act.label}）` : "";
    return [
      `おっけー、${act.key}${label}ね〜。`,
      `了解〜！${act.key}${label}でいこ〜。`,
      `うんうん、${act.key}${label}に寄せよっか。`
    ].map((x) => rhythmize(p + x));
  }

  if (act.kind === "YESNO_NUDGE") return [
    "うん/いや どっち〜？",
    "yes か no だけでOKだよ〜。",
    "肯定か否定だけ教えて〜（うん/いや）"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "YESNO_PICK") {
    if (act.value === "yes") {
      return [
        "おっけー、じゃあその方向でいこ〜。",
        "了解〜。そのまま進めるね。",
        "いいね、同じ認識で進めよっか。"
      ].map((x) => rhythmize(p + x));
    }
    return [
      "了解〜、じゃあ別ルートにしよ。",
      "おけ、違う方向で組み直すね〜。",
      "りょ、じゃあ別案でいくよ〜。"
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

  if (act.kind === "DEV_TRIAGE_PICK") {
    if (act.key === "A") return [
      "おけ。症状ベースでいこ〜。いま何が起きてる？（1行でOK）",
      "了解、症状から切るね。期待と実際の差を一言で教えて〜。",
      "いいね。まず症状の整理しよ〜。"
    ].map((x) => rhythmize(p + x));
    if (act.key === "B") return [
      "ログ見るモードでいこ〜。先頭のエラー行だけ貼って〜。",
      "了解、ログ起点にしよ。最初の赤い行ちょーだい。",
      "おっけ、ログから掘るね。要点行だけでOK〜。"
    ].map((x) => rhythmize(p + x));
    return [
      "再現手順いこ〜。1)2)3)で短く教えて〜。",
      "了解。再現が取れれば早い。最短手順だけお願い〜。",
      "おけ、再現優先でいくね。クリック順でざっくりちょーだい。"
    ].map((x) => rhythmize(p + x));
  }

  if (act.kind === "URL_CLARIFY_PICK") {
    if (act.key === "A") return [
      "やりたいことから決めよ〜。成功条件を1行で教えて〜。",
      "目的ベースで進めるね。何を達成したい？（短くでOK）",
      "おけ、ゴール先に置こう。"
    ].map((x) => rhythmize(p + x));
    if (act.key === "B") return [
      "対象ページの場所ちょーだい。どの画面で詰まってる？",
      "ページ特定しよ〜。画面名かURLの一部を教えて〜。",
      "了解、対象ページから見にいこ。"
    ].map((x) => rhythmize(p + x));
    return [
      "エラー状況から切るね。表示文言あればそのまま貼って〜。",
      "おけ、エラー優先で見よう。何て出てる？",
      "りょ。エラー内容を一言で教えて〜。"
    ].map((x) => rhythmize(p + x));
  }

  if (act.kind === "LIST_SUMMARY_PICK") {
    if (act.key === "A") return [
      "優先度つけよう。最重要を1つだけ選んで〜。",
      "おけ、上から順番決めるね。まず一番重いのどれ？",
      "了解。優先順で並べるよ〜。"
    ].map((x) => rhythmize(p + x));
    if (act.key === "B") return [
      "1行要約いこ。全体を一言で言うと？",
      "要点化するね。結論だけ先にちょーだい。",
      "おけ、短く要約して進めよ。"
    ].map((x) => rhythmize(p + x));
    return [
      "次の一手を決めよ〜。いま5分でできるのはどれ？",
      "了解、実行寄りでいこう。最初の1アクション教えて〜。",
      "りょ。次に手をつける項目を1つだけ選ぼ〜。"
    ].map((x) => rhythmize(p + x));
  }

  if (act.kind === "REPAIR_REPHRASE") return [
    "言い直すね。いま必要なのは『結論1行』だけだよ〜。",
    "ごめん、短くするね。何が起きてるか一言でちょーだい。",
    "了解、もう一回ゆるく聞く。どこで止まった？（一語でもOK）"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "REPAIR_SUMMARY") return [
    "いったん要点だけ整えるね。A)要点 B)次の一手 C)雑談、どれにする？",
    "迷ったら選ぼ〜。A)要約 B)手順 C)いったん休憩",
    "立て直ししよっか。A/B/Cで選んでくれたら続けるよ〜。"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "CLARIFY_ONE") return [
    "ひとつだけ聞くね。いま一番困ってる点はどこ〜？",
    "短くでOK。ゴールだけ教えて〜。",
    "じゃあ一点だけ。何を先に片付けたい？"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "DEV_TRIAGE_MENU") return [
    "開発っぽいね〜。A)症状 B)ログ C)再現手順 どれから見る？",
    "詰まり方を選ぼ〜。A)何が起きた B)エラーログ C)再現ステップ",
    "切り分けるよ〜。A/B/Cの一文字でOK。A)症状 B)ログ C)再現"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "URL_CLARIFY") return [
    "URLありがとう〜。A)やりたいこと B)どのページ C)エラー有無、どれから？",
    "ページ系ね。A)目的 B)対象画面 C)エラー内容 で選んで〜。",
    "おけ、URL文脈で進める。A/B/Cでちょーだい。"
  ].map((x) => rhythmize(p + x));

  if (act.kind === "LIST_SUMMARY_MENU") return [
    "箇条書きありがと〜。A)優先度 B)要点1行 C)次の一手 どれがいい？",
    "このリスト、どう進める？ A)順番決める B)要約 C)最初の1手",
    "整理モードいこ。A/B/Cで選んでくれたら進めるよ〜。"
  ].map((x) => rhythmize(p + x));

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
    lowPressure ? "おけ〜。ゆっくりで大丈夫。" : "おっけ。続き、もうちょいだけ教えて〜。",
    lowPressure ? "うんうん、待ってるよ〜。" : "うんうん。で、いま一番気になるのどこ？",
    lowPressure ? "りょ〜。次いく時に一言ちょーだい。" : "了解〜。次どうする？"
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
      `うんうん。まずは軽く整えよ〜。\nA)短く要約 B)優先度つける C)いったん愚痴る どれ？`,
      "ここ、選んで進めると早いよ〜。\nA)要約 B)次の一手 C)共感だけ"
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
      "いいね。タスクモード入るよ〜。最初の作業名だけ教えて〜。",
      "了解〜。まず『やること名』を一個だけちょーだい。"
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
