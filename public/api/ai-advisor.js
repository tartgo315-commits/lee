async function readJsonBody(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = await new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => {
      d += c;
    });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
  try {
    return JSON.parse(String(raw || '{}'));
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { portfolio, provider } = await readJsonBody(req);
  if (!portfolio) {
    return res.status(400).json({ error: 'missing portfolio' });
  }

  const prompt = `你是一位专业的全球资产配置顾问，精通中国、美国、澳大利亚三地资产。
请根据用户的真实持仓数据，用中文给出一份完整的理财分析报告。

严格按以下格式输出，每部分用【】标注：

【综合评估】
对整体组合健康度做总体判断，包括分散程度、盈亏状况、风险水平。2-3句话。

【亮点与优势】
指出当前持仓中表现好的地方，具体到标的名称和数字。

【风险与隐患】
指出2-3个具体风险点，必须结合用户的真实持仓数字。

【优先行动建议】
给出3条具体可执行的建议，按紧急程度排序。

【长期配置建议】
给出1-2条长期优化方向。

语气专业简洁，数字要具体，不要泛泛而谈。

用户持仓：
${portfolio}`;

  async function tryGemini() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('no key');
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
        }),
      }
    );
    const d = await r.json();
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('empty');
    return { advice: text, model: 'Gemini 1.5 Flash' };
  }

  async function tryGroq() {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('no key');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content;
    if (!text) throw new Error('empty');
    return { advice: text, model: 'Groq Llama3-70B' };
  }

  async function tryCohere() {
    const key = process.env.COHERE_API_KEY;
    if (!key) throw new Error('no key');
    const r = await fetch('https://api.cohere.ai/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'command-r',
        prompt,
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });
    const d = await r.json();
    const text = d?.generations?.[0]?.text;
    if (!text) throw new Error('empty');
    return { advice: text, model: 'Cohere Command-R' };
  }

  const order =
    provider === 'groq'
      ? [tryGroq, tryGemini, tryCohere]
      : provider === 'cohere'
        ? [tryCohere, tryGemini, tryGroq]
        : [tryGemini, tryGroq, tryCohere];

  for (const fn of order) {
    try {
      const result = await fn();
      return res.json(result);
    } catch {
      continue;
    }
  }

  return res.status(502).json({ error: '所有AI服务均不可用，请检查环境变量' });
}
