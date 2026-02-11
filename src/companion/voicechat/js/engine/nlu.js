const PUNCT_TAIL_RE = /[\s!！?？。．…〜～]+$/g;

export function normalizeInput(text) { return String(text ?? "").replace(/\s+/g, " ").trim(); }
export function stripTailPunct(text) { return String(text ?? "").replace(PUNCT_TAIL_RE, "").trim(); }

const GREET_RE = /^(おは(よう)?|こんにちは|こんばんは|やあ|やぁ|hi|hello)$/i;
const THANKS_RE = /(ありがとう|助かった|感謝|サンキュー|thanks)/i;

const TIRED_RE = /(疲|つかれ|しんど|だる|眠|つら|無理|きつ)/;
const HAPPY_RE = /(うれし|嬉|やった|最高|できた|達成)/;
const BUSY_RE = /(忙|いそが|やばい|締切|間に合|詰ん)/;

const SHORT_ACK_RE = /^(はい|うん|ok|okay|了解|りょ|なるほど|そう|それな|たしかに)$/i;

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

export function parseUserText(text) {
  const clean = normalizeInput(text);
  const tail = stripTailPunct(clean);
  const lower = tail.toLowerCase();

  const isGreeting = GREET_RE.test(lower);
  const isThanks = THANKS_RE.test(clean);
  const isTired = TIRED_RE.test(clean);
  const isSmalltalk = SMALLTALK_REQUEST_RE.test(clean);
  const isReturnWork = RETURN_WORK_RE.test(clean);
  const isShortAck = SHORT_ACK_RE.test(lower);
  const isQuestion = QUESTION_HINT_RE.test(clean);
  const isTaskRequest = TASK_REQUEST_RE.test(clean);

  const isShare = (!isQuestion && !isShortAck && SHARE_HINT_RE.test(clean) && clean.length >= 4);

  let intent = "other";
  if (!clean) intent = "empty";
  else if (isThanks) intent = "thanks";
  else if (isGreeting) intent = "greet";
  else if (isReturnWork) intent = "return_work";
  else if (isTired) intent = "tired";
  else if (isSmalltalk) intent = "smalltalk";
  else if (isTaskRequest) intent = "task_request";
  else if (isShare) intent = "share";
  else if (isQuestion) intent = "question";
  else if (isShortAck) intent = "ack";

  let mood = "neutral";
  if (isTired) mood = "tired";
  else if (HAPPY_RE.test(clean)) mood = "happy";
  else if (BUSY_RE.test(clean)) mood = "busy";

  const len = clean.length;
  const lenBucket = (len <= 6) ? "short" : (len >= 60 ? "long" : "mid");
  const keyword = extractKeyword(clean);

  const slotsHint = extractSlotCandidates(clean);

  return {
    raw: String(text ?? ""),
    clean,
    tail,
    intent,
    mood,
    lenBucket,
    keyword,
    slotsHint
  };
}
