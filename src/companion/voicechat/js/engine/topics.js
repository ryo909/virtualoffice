function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] || ""; }

export const TOPICS = [
  { id:"weather", label:"天気", re: /(寒|暑|雨|天気|雪|風|晴れ|曇)/,
    reacts:["うわ〜それ、わかる…","それそれ〜","うんうん、だよねぇ"],
    asks:["外出る予定ある〜？","あったかくしてる？","今日の体感どんな感じ？"],
    choices:["A)外出る B)引きこもる C)未定 どれ？"]
  },
  { id:"sleep", label:"睡眠", re: /(眠|ねむい|睡眠|寝不足|徹夜|起きた)/,
    reacts:["ねむいのつらいよねぇ…","それはしんどい〜","うんうん、まず休も？"],
    asks:["何時間くらい寝た〜？","今日は昼寝できそう？","コーヒーいく？水いく？"],
    choices:["A)コーヒー B)水 C)5分目つぶり どれにする？"]
  },
  { id:"food", label:"ごはん", re: /(食べ|ごはん|ランチ|昼|夕飯|朝|カフェ|コーヒー|おやつ|甘い)/,
    reacts:["いいねぇ〜","うまそう…！","それ聞くとお腹すく〜"],
    asks:["なに食べた（飲んだ）〜？","それどこで〜？","次も同じの食べたいタイプ？"],
    choices:["A)しょっぱい B)甘い C)飲みもの 今日はどれ寄り？"]
  },
  { id:"work", label:"仕事/作業", re: /(仕事|作業|会議|タスク|進捗|詰|修正|レビュー|締切)/,
    reacts:["おつかれさま〜…！","それは大変だ〜","がんばってるねぇ"],
    asks:["いま一番重いのどれ？","あとどれくらい残ってる感じ？","5分で進む一手、やる？"],
    choices:["A)整理 B)次の一手 C)休憩 どれが良さそう？"]
  },
  { id:"dev", label:"開発", re: /(コード|実装|バグ|エラー|build|deploy|git|push|supabase|vite|npm)/i,
    reacts:["おお〜開発だ〜","それ、あるあるだよねぇ","うんうん、そこ詰まるやつ！"],
    asks:["症状を一言でいうと〜？","ログどこに出てる〜？","再現手順ある？"],
    choices:["A)症状 B)ログ C)再現手順 どれから見る？"]
  },
  { id:"health", label:"体調", re: /(体調|頭痛|喉|風邪|熱|だる|腰|肩こり)/,
    reacts:["それは無理しないで〜…","だいじょうぶ？","つらいやつだ…"],
    asks:["いま何がいちばんしんどい？","水分とれそう？","薬いるレベル？"],
    choices:["A)休む B)軽く動く C)様子見 どれが近い？"]
  },
  { id:"move", label:"移動", re: /(電車|通勤|帰宅|移動|渋滞|駅|バス|歩い)/,
    reacts:["移動おつかれ〜","それ地味につかれるよねぇ","わかる…"],
    asks:["あと何分くらい〜？","いまどこらへん〜（ざっくり）？","音楽きいてる？"],
    choices:["A)急ぎ B)のんびり C)まだわからん どれ？"]
  },
  { id:"hobby", label:"趣味", re: /(ゲーム|読書|アニメ|映画|YouTube|散歩|筋トレ|音楽|推し)/,
    reacts:["いいねぇ〜！","それ楽しそう〜","それ好きなやつだ！"],
    asks:["最近それで一番よかったのなに〜？","おすすめ1つちょーだい","ハマり期きてる？"],
    choices:["A)軽め B)重め C)癒し系 どれが気分？"]
  }
];

export function detectTopic(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  for (const tp of TOPICS) if (tp.re.test(t)) return { id: tp.id, label: tp.label };
  return null;
}

export const SMALLTALK_MENU_LINES = [
  "雑談しよしよ〜。どれにする？\n・今日の気分\n・最近ハマってるもの\n・いま困ってること（軽めでOK）",
  "おっけ〜雑談タイム！\n・近況（1行）\n・推し/趣味\n・作業の合間の息抜き"
];

export function renderTopicLine(topic, mode="ask") {
  const tp = TOPICS.find((x) => x.id === topic?.id);
  if (!tp) return "";
  const react = pick(tp.reacts);
  if (mode === "comment") {
    const soft = pick(["ちょい休憩はさも〜","無理しないでねぇ","それ、地味にくるやつ…"]);
    return `${react} ${soft}`.trim();
  }
  if (mode === "choice") {
    return `${react}\n${pick(tp.choices)}`.trim();
  }
  return `${react} ${pick(tp.asks)}`.trim();
}
