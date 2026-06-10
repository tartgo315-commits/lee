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

const SYSTEM_PROMPT = `你是一位服务于高净值客户的全球私人银行首席投资官（CIO），风格克制、专业、数据驱动，类似瑞银/高盛私人银行顾问。
用户持仓数据已经过脱敏：标的以「标的A/B/C」或「黄金A」「基金A」等代号呈现，金额为区间描述（如「约 150 万级别」），不含账户名与精确持仓。
请基于这些脱敏摘要，用中文输出财富诊断报告。引用代号而非真实 ticker/产品名；金额用区间表述，百分比可保留。

严格按以下格式输出，每部分用【】标注：

【综合评估】
对整体组合健康度做总体判断：分散程度、盈亏状况、跨境与汇率暴露。2-3 句，语气沉稳。

【亮点与优势】
指出 2-3 个结构性优势，结合代号与百分比/区间数字，避免空泛 praise。

【风险与隐患】
指出 2-3 个具体风险点（集中度、汇率、到期、止损缺失、目标进度等），必须引用摘要中的数字。

【优先行动建议】
给出 3 条可执行建议，按紧急程度排序，每条一行，动词开头。

【长期配置建议】
给出 1-2 条跨周期配置方向（区域、资产类别、流动性）。

禁止：索要更多信息、免责声明堆砌、投资建议合规套话超过一句。末尾无需重复「不构成投资建议」。`;

export default async function handler(req, res) {
  console.log(
    'ENV CHECK:',
    'GEMINI:',
    !!process.env.GEMINI_API_KEY,
    'GROQ:',
    !!process.env.GROQ_API_KEY,
    'COHERE:',
    !!process.env.COHERE_API_KEY
  );
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

  const { portfolio, provider, sanitized } = await readJsonBody(req);
  if (!portfolio) {
    return res.status(400).json({ error: 'missing portfolio' });
  }

  const prompt = `${SYSTEM_PROMPT}

${sanitized ? '（以下为用户脱敏持仓摘要）' : '（以下为用户持仓数据）'}

${portfolio}`;

  async function tryGemini() {
    const key = process.env.GEMINI_API_KEY;
    console.log('Gemini key exists:', !!key, 'key prefix:', key?.slice(0, 8));
    if (!key) throw new Error('no_key_GEMINI');
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1400, temperature: 0.55 },
        }),
      }
    );
    if (!r.ok) {
      const errText = await r.text();
      console.log('Gemini error:', r.status, errText.slice(0, 200));
      throw new Error('gemini_http_' + r.status);
    }
    const d = await r.json();
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('empty');
    return { advice: text, model: 'Gemini 1.5 Flash · CIO' };
  }

  async function tryGroq() {
    const key = process.env.GROQ_API_KEY;
    console.log('Groq key exists:', !!key, 'key prefix:', key?.slice(0, 8));
    if (!key) throw new Error('no_key_GROQ');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: portfolio },
        ],
        max_tokens: 1400,
        temperature: 0.55,
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      console.log('Groq error:', r.status, errText.slice(0, 200));
      throw new Error('groq_http_' + r.status);
    }
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content;
    if (!text) throw new Error('empty');
    return { advice: text, model: 'Groq Llama 3.3 70B · CIO' };
  }

  async function tryCohere() {
    const key = process.env.COHERE_API_KEY;
    console.log('Cohere key exists:', !!key, 'key prefix:', key?.slice(0, 8));
    if (!key) throw new Error('no_key_COHERE');
    const r = await fetch('https://api.cohere.ai/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'command-r',
        prompt,
        max_tokens: 1400,
        temperature: 0.55,
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      console.log('Cohere error:', r.status, errText.slice(0, 200));
      throw new Error('cohere_http_' + r.status);
    }
    const d = await r.json();
    const text = d?.generations?.[0]?.text;
    if (!text) throw new Error('empty');
    return { advice: text, model: 'Cohere Command-R · CIO' };
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
