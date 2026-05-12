const router = require('express').Router();
const { Client, validateSignature } = require('@line/bot-sdk');
const dayjs = require('dayjs');
const supabase = require('../db');

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};

const client = new Client(lineConfig);

// LINE User ID → 花費人 對應表（從環境變數讀取）
function getPerson(userId) {
  const map = {
    [process.env.LINE_USER_ID_群]: '群',
    [process.env.LINE_USER_ID_萱]: '萱'
  };
  return map[userId] || null;
}

const CATEGORIES = ['餐飲', '交通', '購物', '日用品', '娛樂', '醫療', '其他'];

const CATEGORY_KEYWORDS = {
  餐飲: ['早餐', '午餐', '晚餐', '咖啡', '飲料', '餐廳', '便當', '麥當勞', '肯德基', '火鍋', '燒烤', '壽司', '麵', '飯', '小吃', '路易莎', '星巴克'],
  交通: ['捷運', '公車', 'uber', 'taxi', '計程車', '油費', '停車', '高鐵', '火車', '機票'],
  購物: ['蝦皮', 'momo', '網購', 'uniqlo', 'zara', '衣服', '鞋子'],
  日用品: ['全聯', '家樂福', '大潤發', '超市', '洗髮', '沐浴', '衛生紙', '清潔'],
  娛樂: ['電影', 'ktv', '遊戲', '電玩', '演唱會', '展覽'],
  醫療: ['藥', '診所', '醫院', '康是美', '藥妝'],
};

function guessCategory(description) {
  const desc = description.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => desc.includes(k.toLowerCase()))) return cat;
  }
  return '其他';
}

/*
  支援格式：
  早餐85          → 自動辨識使用者
  超市 日用品 320
  計程車 交通 150 2026-05-10
  幫助            → 顯示說明
*/
function parseMessage(text) {
  const t = text.trim();
  if (/^(幫助|help|說明|\?)$/i.test(t)) return { type: 'help' };

  // 嘗試從文字中提取金額（數字部分）
  const amountMatch = t.match(/(\d+(?:\.\d+)?)/g);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[amountMatch.length - 1]);

  // 日期
  const dateMatch = t.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : dayjs().format('YYYY-MM-DD');

  // 去掉金額和日期，剩下描述+分類
  let remaining = t
    .replace(date, '')
    .replace(amount.toString(), '')
    .trim();

  // 找分類
  let category = null;
  for (const cat of CATEGORIES) {
    if (remaining.includes(cat)) {
      category = cat;
      remaining = remaining.replace(cat, '').trim();
      break;
    }
  }

  const description = remaining.replace(/\s+/g, ' ').trim() || '其他';
  if (!category) category = guessCategory(description);

  return { type: 'expense', category, description, amount, date };
}

function helpText() {
  return `📒 記帳小幫手使用說明

格式：[描述][金額] [分類(選填)] [日期(選填)]

✅ 範例：
早餐85
全聯 日用品 320
計程車 交通 150 2026-05-10

📂 分類：餐飲、交通、購物、日用品、娛樂、醫療、其他
（不填分類會自動猜測）`;
}

router.post('/', async (req, res) => {
  const signature = req.headers['x-line-signature'];
  if (!validateSignature(req.body, lineConfig.channelSecret, signature)) {
    return res.status(401).send('Invalid signature');
  }

  const body = JSON.parse(req.body.toString());
  res.sendStatus(200);

  for (const event of body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const replyToken = event.replyToken;
    const text = event.message.text;
    const userId = event.source?.userId;
    const parsed = parseMessage(text);

    if (!parsed) {
      await client.replyMessage(replyToken, {
        type: 'text', text: '格式錯誤 😅\n請輸入「幫助」查看使用說明'
      });
      continue;
    }

    if (parsed.type === 'help') {
      await client.replyMessage(replyToken, { type: 'text', text: helpText() });
      continue;
    }

    // 辨識使用者
    const person = getPerson(userId);
    if (!person) {
      // 尚未設定此 User ID，回傳 ID 讓管理員設定
      await client.replyMessage(replyToken, {
        type: 'text',
        text: `⚠️ 尚未綁定此帳號\n你的 LINE User ID：\n${userId}\n請聯絡管理員加入`
      });
      continue;
    }

    const { category, description, amount, date } = parsed;
    const { error } = await supabase.from('expenses').insert([{
      date, person, category, description, amount, source: 'line'
    }]);

    if (error) {
      await client.replyMessage(replyToken, { type: 'text', text: `❌ 儲存失敗：${error.message}` });
    } else {
      await client.replyMessage(replyToken, {
        type: 'text',
        text: `✅ 已記錄！\n👤 ${person}　📂 ${category}\n📝 ${description}\n💰 $${amount}\n📅 ${date}`
      });
    }
  }
});

module.exports = router;
