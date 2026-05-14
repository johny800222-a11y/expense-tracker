const router = require('express').Router();
const { Client, validateSignature } = require('@line/bot-sdk');
const dayjs = require('dayjs');
const supabase = require('../db');

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};

const client = new Client(lineConfig);

// LINE User ID → 花費人
function getPerson(userId) {
  if (process.env.LINE_USER_ID_QUN  && userId === process.env.LINE_USER_ID_QUN)  return '群';
  if (process.env.LINE_USER_ID_XUAN && userId === process.env.LINE_USER_ID_XUAN) return '萱';
  return null;
}

const CATEGORIES = ['餐飲', '交通', '購物', '日用品', '娛樂', '醫療', '店務', '教育費', '貸款', '其他'];

const CATEGORY_KEYWORDS = {
  餐飲: ['早餐', '午餐', '晚餐', '咖啡', '飲料', '餐廳', '便當', '麥當勞', '火鍋', '燒烤', '壽司', '麵', '飯', '小吃', '路易莎', '星巴克'],
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

function parseMessage(text) {
  // 全形數字轉半形、全形逗號轉半形
  const t = text.trim()
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))
    .replace(/，/g, ',');

  if (/^(幫助|help|說明|\?)$/i.test(t)) return { type: 'help' };

  // 支援 24000 或 24,000 格式（+ 而非 * 避免拆分普通數字）
  const amountMatch = t.match(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g);
  if (!amountMatch) return null;

  const rawAmount = amountMatch[amountMatch.length - 1];
  const amount = parseFloat(rawAmount.replace(/,/g, ''));
  if (!amount || amount <= 0 || isNaN(amount)) return null;
  const dateMatch = t.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : dayjs().format('YYYY-MM-DD');

  let remaining = t.replace(date, '').replace(rawAmount, '').trim();

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

📂 分類：餐飲、交通、購物、日用品、娛樂、醫療、店務、教育費、貸款、其他`;
}

async function reply(replyToken, text) {
  try {
    await client.replyMessage(replyToken, { type: 'text', text });
    console.log('[LINE] reply sent:', text.substring(0, 30));
  } catch (e) {
    console.error('[LINE] replyMessage error:', e.message);
  }
}

router.post('/', async (req, res) => {
  console.log('[LINE] webhook received');
  const signature = req.headers['x-line-signature'];

  if (!validateSignature(req.body, lineConfig.channelSecret, signature)) {
    console.error('[LINE] invalid signature');
    return res.status(401).send('Invalid signature');
  }

  let body;
  try {
    body = JSON.parse(req.body.toString());
  } catch (e) {
    console.error('[LINE] JSON parse error:', e.message);
    return res.status(400).send('Bad request');
  }

  res.sendStatus(200);
  console.log('[LINE] events count:', body.events?.length);

  for (const event of body.events || []) {
    console.log('[LINE] event type:', event.type, 'userId:', event.source?.userId);

    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const { replyToken } = event;
    const text = event.message.text;
    const userId = event.source?.userId;

    console.log('[LINE] message:', text, 'userId:', userId);

    const parsed = parseMessage(text);
    console.log('[LINE] parsed:', JSON.stringify(parsed));

    if (!parsed) {
      await reply(replyToken, '格式錯誤 😅\n請輸入「幫助」查看使用說明');
      continue;
    }

    if (parsed.type === 'help') {
      await reply(replyToken, helpText());
      continue;
    }

    const person = getPerson(userId);
    console.log('[LINE] person:', person, 'LINE_USER_ID_群:', process.env.LINE_USER_ID_群);

    if (!person) {
      await reply(replyToken, `⚠️ 尚未綁定此帳號\n你的 LINE User ID：\n${userId}`);
      continue;
    }

    const { category, description, amount, date } = parsed;
    console.log('[LINE] inserting:', { date, person, category, description, amount });

    const { error } = await supabase.from('expenses').insert([{
      date, person, category, description, amount, source: 'line'
    }]);

    if (error) {
      console.error('[LINE] supabase error:', error.message);
      await reply(replyToken, `❌ 儲存失敗：${error.message}`);
    } else {
      await reply(replyToken, `✅ 已記錄！\n👤 ${person}　📂 ${category}\n📝 ${description}\n💰 $${amount}\n📅 ${date}`);
    }
  }
});

module.exports = router;
