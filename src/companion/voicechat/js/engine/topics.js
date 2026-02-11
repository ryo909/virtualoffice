function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] || ""; }

export const TOPICS = [
  { id:"weather", label:"天気", re: /(寒|さむ|暑|あつ|あっつ|雨|あめ|天気|雪|ゆき|風|かぜ|晴れ|はれ|曇|くもり|じめ|湿気|花粉|台風)/,
    reacts:["うわ〜それ、わかる…","それそれ〜","うんうん、だよねぇ"],
    asks:["外出る予定ある〜？","あったかくしてる？","今日の体感どんな感じ？"],
    choices:["A)外出る B)引きこもる C)未定 どれ？"]
  },
  { id:"sleep", label:"睡眠", re: /(眠|ねむ|ねみ|睡眠|寝不足|徹夜|起きた|寝落ち|ねおち|二度寝|起きれ)/,
    reacts:["ねむいのつらいよねぇ…","それはしんどい〜","うんうん、まず休も？"],
    asks:["何時間くらい寝た〜？","今日は昼寝できそう？","コーヒーいく？水いく？"],
    choices:["A)コーヒー B)水 C)5分目つぶり どれにする？"]
  },
  { id:"food", label:"ごはん", re: /(食べ|ごはん|飯|めし|ランチ|昼|夕飯|朝|カフェ|コーヒー|おやつ|甘い|ラーメン|らーめん|麺|うま|腹(減|へっ)|おなかすいた)/,
    reacts:["いいねぇ〜","うまそう…！","それ聞くとお腹すく〜"],
    asks:["なに食べた（飲んだ）〜？","それどこで〜？","次も同じの食べたいタイプ？"],
    choices:["A)おすすめする B)写真ある C)内緒 どれ？"]
  },
  { id:"work", label:"仕事", re: /(仕事|しごと|作業|会議|タスク|todo|進捗|詰|修正|レビュー|締切|やること|段取り|調整|連絡)/i,
    reacts:["おつかれさま〜","それ、あるよねぇ","うんうん、がんばってる"],
    asks:["いま何やってるとこ？","詰まってる？順調？","優先度どれが高い？"],
    choices:["A)詰まってる B)順調 C)わからん どれ？"]
  },
  { id:"dev", label:"開発", re: /(コード|実装|バグ|エラー|落ち|こけ|壊れ|動か|動かん|真っ白|固ま|止ま|ログ|build|deploy|gh-pages|actions|github|git|push|pull|merge|supabase|vite|npm|node|react|typescript|ts|js|css|api|wsl)/i,
    reacts:["おお〜開発だ〜","それ、あるあるだよねぇ","うんうん、そこ詰まるやつ！"],
    asks:["症状を一言でいうと〜？","ログどこに出てる〜？","再現手順ある？"],
    choices:["A)症状 B)ログ C)再現手順 どれから見る？"]
  },
  { id:"health", label:"体調", re: /(体調|頭痛|喉|風邪|熱|だる|腰|肩こり|痛い|胃|吐き|しんど|つら)/,
    reacts:["それは無理しないで〜…","だいじょうぶ？","つらいやつだ…"],
    asks:["いま何がいちばんしんどい？","水分とれそう？","薬いるレベル？"],
    choices:["A)休む B)軽く動く C)様子見 どれが近い？"]
  },
  { id:"move", label:"移動", re: /(電車|通勤|帰宅|移動|渋滞|駅|バス|歩い|到着|ついた|遅延|遅れ|乗換|乗り換え|乗った|降りた)/,
    reacts:["移動おつかれ〜","それ地味につかれるよねぇ","わかる…"],
    asks:["あと何分くらい〜？","いまどこらへん〜（ざっくり）？","音楽きいてる？"],
    choices:["A)急ぎ B)のんびり C)まだわからん どれ？"]
  },
  { id:"hobby", label:"趣味", re: /(ゲーム|読書|アニメ|映画|YouTube|散歩|筋トレ|音楽|推し|漫画|まんが|ドラマ|配信|ボカロ|ライブ|イベント)/,
    reacts:["いいねぇ〜","それ最高じゃん","うらやましい…！"],
    asks:["最近ハマってるのなに〜？","それどのへんが好き？","次いつやる？"],
    choices:["A)語る B)おすすめ聞く C)雑談で流す どれ？"]
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
