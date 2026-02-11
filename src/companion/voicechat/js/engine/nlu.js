const PUNCT_TAIL_RE = /[\s!！?？。．…〜～]+$/g;

export function normalizeInput(text) { return String(text ?? "").replace(/\s+/g, " ").trim(); }
export function stripTailPunct(text) { return String(text ?? "").replace(PUNCT_TAIL_RE, "").trim(); }

const GREET_RE = /^(おは(よう)?|こんにちは|こんばんは|やあ|やぁ|hi|hello)$/i;
const THANKS_RE = /(ありがとう|助かった|感謝|サンキュー|thanks)/i;

const TIRED_RE = /(疲|つかれ|しんど|だる|眠|つら|無理|きつ)/;
const HAPPY_RE = /(うれし|嬉|やった|最高|できた|達成)/;
const BUSY_RE = /(忙|いそが|やばい|締切|間に合|詰ん)/;

const SHORT_ACK_RE = /^(はい|うん|うい|ok|okay|おけ|おっけ|了解|りょ|りょか|ふむ|なるほど|そう|そっか|それな|たしかに|わかる|わかった)$/i;
const YES_RE = /^(はい|うん|うい|ok|okay|おけ|おっけ|了解|りょ|りょか|yes|y)$/i;
const NO_RE = /^(いいえ|いや|やだ|無理|むり|no|n)$/i;
const LAUGH_RE = /^(w+|ｗ+|www+|草+|笑+|😂+|🤣+)+$/i;
// 「？」単体や「え？」系は “困惑/確認” とみなす
const CONFUSED_RE = /^(え|えっ|は\?+|は？+|ん\?+|ん？+|なに|何|まじ|マジ|わからん|わからない)$/u;
const QONLY_RE = /^[?？]+$/;
const PUNCT_ONLY_RE = /^[!！?？。．…〜～、,\.\s]+$/;

const LOG_HINT_RE = /(error|exception|trace|stack|npm\s+err|vite|build|deploy|at\s+.+:\d+:\d+|referenceerror|typeerror|syntaxerror)/i;
const CODE_HINT_RE = /(```|(^|\n)\s*(import|export|function|const|let|var|class)\b|[{};]{2,})/i;
const URL_RE = /https?:\/\/\S+/i;
const LIST_LINE_RE = /^\s*[-*・]\s+.+/;

const SMALLTALK_REQUEST_RE = /(雑談しよ|雑談しよう|雑談する|話そ|おしゃべり|ひま|暇|退屈|相手して)/;
const RETURN_WORK_RE = /(作業戻|戻る|仕事戻|作業する|やるか|続きやる)/;

const QUESTION_HINT_RE = /(\?|？|どう|なに|何|いつ|どこ|なぜ|なんで|方法|やり方|できます|できる|教えて)/u;
const SHARE_HINT_RE = /(した|してる|してた|だった|なった|行った|いった|食べた|飲んだ|見た|読んだ|買った|終わった|疲れた)/;

const TASK_REQUEST_RE = /(タスク|TODO|やること|計画|優先度|手順|指示文).*(整理|作る|作成|したい|お願い|教えて|決めたい|出して)|タスク整理したい|やること整理したい/i;

function extractKeyword(text) {
  const source = String(text || "").trim();
  if (!source) return "";
  const pick = (v) => String(v || "").replace(/^[\s"'`「」『』（）［］【】、。！？,.!?]+/g, "")
    .replace(/[\s"'`「」『』（）［］【】、。！？,.!?]+$/g, "").trim().slice(0, 20);

  // ひらがな以外の連続（英数字/漢字など）を優先
  const nonHiragana = source.match(/[^\u3040-\u309F\s]{2,}/u);
  if (nonHiragana?.[0]) return pick(nonHiragana[0]);

  const generic = source.match(/[^\s]{1,}/u);
  if (generic?.[0]) return pick(generic[0]);

  return pick(source.replace(/\s+/g, ""));
}

function extractSlotCandidates(clean) {
  const s = String(clean || "");

  // deadline
  let deadline = "";
  const mDate = s.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  if (mDate) deadline = mDate[1];
  else if (/(今日)/.test(s)) deadline = "今日";
  else if (/(明日)/.test(s)) deadline = "明日";
  else if (/(今週)/.test(s)) deadline = "今週";
  else if (/(来週)/.test(s)) deadline = "来週";

  // format
  let format = "";
  if (/(箇条書き|チェックリスト)/.test(s)) format = "箇条書き";
  else if (/(手順|ステップ)/.test(s)) format = "手順";
  else if (/(指示文)/.test(s)) format = "指示文";
  else if (/(要約|まとめ)/.test(s)) format = "要約";

  // tone
  let tone = "";
  if (/(ゆる|ゆるめ|ゆるキャラ)/.test(s)) tone = "ゆるめ";
  else if (/(丁寧|ていねい)/.test(s)) tone = "丁寧";
  else if (/(かため|硬め|フォーマル)/.test(s)) tone = "かため";

  // audience
  let audience = "";
  if (/(社内|チーム)/.test(s)) audience = "社内/チーム";
  else if (/(上司)/.test(s)) audience = "上司";
  else if (/(クライアント|顧客)/.test(s)) audience = "クライアント";
  else if (/(自分用)/.test(s)) audience = "自分用";

  // taskName（雑でOK：キーワード優先）
  let taskName = "";
  const mTask = s.match(/(.*?)(を|の)(.*?)(する|やる|進める|作る)/);
  if (mTask && mTask[0]) taskName = mTask[0].slice(0, 40);
  if (!taskName && TASK_REQUEST_RE.test(s) && s.length >= 12) taskName = extractKeyword(s);

  return { taskName, audience, deadline, format, tone };
}

function extractChoice(tail) {
  const s = String(tail || "").trim();
  if (!s) return null;

  // A/B/C (Aで, Bかな なども許容)
  const mABC = s.match(/^([abc])(?:で|かな|がいい|にする)?$/i);
  if (mABC) {
    const key = mABC[1].toUpperCase();
    return { key, idx: ["A", "B", "C"].indexOf(key), raw: s };
  }

  // 1/2/3
  const mNum = s.match(/^([123])(?:で|かな|がいい|にする)?$/);
  if (mNum) {
    const idx = Number(mNum[1]) - 1;
    return { key: ["A", "B", "C"][idx], idx, raw: s };
  }

  // 位置指定（上/真ん中/下）
  if (/^(上|うえ)$/.test(s)) return { key: "A", idx: 0, raw: s };
  if (/^(真ん中|まんなか|中|なか)$/.test(s)) return { key: "B", idx: 1, raw: s };
  if (/^(下|した)$/.test(s)) return { key: "C", idx: 2, raw: s };

  // 指示語（メニュー文脈があるときだけ確定させる）
  if (/^(それ|そっち|こっち)$/.test(s)) return { key: "DEIXIS", idx: null, raw: s };

  return null;
}

function detectInputType(rawText) {
  const raw = String(rawText || "");
  const clean = raw.trim();
  if (!clean) return "text";

  const lines = raw.split(/\r?\n/);
  const listCount = lines.filter((line) => LIST_LINE_RE.test(line)).length;

  if (LOG_HINT_RE.test(raw) && (lines.length >= 2 || /error|exception|stack|npm\s+err/i.test(raw))) return "log";
  if (CODE_HINT_RE.test(raw)) return "code";
  if (URL_RE.test(raw)) return "url";
  if (listCount >= 2) return "list";
  return "text";
}

export function parseUserText(text) {
  const inputType = detectInputType(text);
  const clean = normalizeInput(text);
  const tail = stripTailPunct(clean);
  const lower = tail.toLowerCase();

  const isQOnly = (!!clean && QONLY_RE.test(clean));
  const isPunctOnly = (!!clean && !tail && PUNCT_ONLY_RE.test(clean) && !isQOnly);
  const choice = extractChoice(tail);

  const isGreeting = GREET_RE.test(lower);
  const isThanks = THANKS_RE.test(clean);
  const isTired = TIRED_RE.test(clean);
  const isSmalltalk = SMALLTALK_REQUEST_RE.test(clean);
  const isReturnWork = RETURN_WORK_RE.test(clean);

  const isLaugh = LAUGH_RE.test(lower);
  const isConfused = isQOnly || CONFUSED_RE.test(tail);

  const isShortAck = SHORT_ACK_RE.test(lower);
  const yesNo = YES_RE.test(lower) ? "yes" : (NO_RE.test(lower) ? "no" : "");
  const isQuestion = QUESTION_HINT_RE.test(clean);
  const isTaskRequest = inputType === "text" && TASK_REQUEST_RE.test(clean);

  const isShare = (!isQuestion && !isShortAck && !choice && !isLaugh && !isConfused && SHARE_HINT_RE.test(clean) && clean.length >= 4);

  let intent = "other";
  if (!clean || isPunctOnly) intent = "empty";
  else if (isThanks) intent = "thanks";
  else if (isGreeting) intent = "greet";
  else if (isReturnWork) intent = "return_work";
  else if (isTired) intent = "tired";
  else if (isSmalltalk) intent = "smalltalk";
  else if (isTaskRequest) intent = "task_request";
  else if (choice) intent = "choice";
  else if (isLaugh) intent = "laugh";
  else if (isConfused) intent = "confused";
  else if (isShare) intent = "share";
  else if (isQuestion) intent = "question";
  else if (isShortAck) intent = "ack";

  let mood = "neutral";
  if (isTired) mood = "tired";
  else if (HAPPY_RE.test(clean)) mood = "happy";
  else if (BUSY_RE.test(clean)) mood = "busy";

  const len = clean.length;
  const lenBucket = (len <= 6) ? "short" : (len >= 60 ? "long" : "mid");
  // 短文ノイズ（相槌/選択/笑/困惑/空白）は keyword を空にして暴走を防ぐ
  const keyword = (["ack", "choice", "laugh", "confused", "empty"].includes(intent)) ? "" : extractKeyword(clean);

  const slotsHint = extractSlotCandidates(clean);

  return {
    raw: String(text ?? ""),
    clean,
    tail,
    intent,
    mood,
    inputType,
    lenBucket,
    keyword,
    slotsHint,
    choice,
    yesNo
  };
}

export function enhanceParsedWithExpect(parsed, state) {
  const p = { ...(parsed || {}) };
  p.choice = p.choice ? { ...p.choice } : null;

  const exp = state?.expect;
  if (!exp || typeof exp !== "object") return p;

  if (exp.type === "choice") {
    if (!p.choice) {
      const t = String(p.tail || p.clean || "").trim();
      if (/^(それ|そっち|こっち)$/.test(t) || p.intent === "ack") {
        p.choice = { key: "DEIXIS", idx: null, raw: t || p.clean || "" };
        p.intent = "choice";
        p.keyword = "";
      }
    }
  }

  if (exp.type === "yesno") {
    if (!p.yesNo && p.intent === "ack") p.yesNo = "yes";
    if (p.yesNo) {
      p.intent = "ack";
      p.keyword = "";
    }
  }

  if (exp.type === "freeText" || exp.type === "clarify") {
    if (p.intent === "empty") p.intent = "confused";
  }

  return p;
}
