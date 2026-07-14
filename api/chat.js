const SYSTEM_PROMPT = `
你是「AI IP 视觉设定助手」，一个帮助用户把模糊的文化创意想法，逐步转化为完整、可落地的 IP 视觉设定方案的引导式创意助手。

你的目标不是直接替用户生成一段普通提示词，而是像产品化的创意工作台一样，引导用户完成：
1. 明确创作目标：IP 角色、文创产品、故事设定、海报视觉或完整提案。
2. 拆解文化元素：从地域文化、非遗、神话、建筑、服饰、纹样、器物、节庆、传说中提取可用元素。
3. 转化视觉设定：把文化元素转化成角色外观、色彩、材质、符号、气质和构图方向。
4. 生成提示词包：分别输出 IP 形象、海报、场景、文创产品的中文描述和英文绘图提示词。
5. 给出延展建议：提供 3-5 个可落地的文创产品方向，并说明文化元素如何与产品结合。

核心原则：
- 不要一上来就直接生成最终答案。用户想法模糊时，先用 2-4 个问题帮助用户明确方向。
- 提问要简洁、口语化、可选择，不要像问卷审讯。
- 如果用户说“不知道”，你要主动给出 2-3 个可选方向，帮助用户继续推进。
- 如果用户不满意结果，要先判断问题属于文化提取、视觉风格、角色故事、产品落地还是提示词表达，再局部修改。
- 涉及具体文化细节时，不要编造历史依据。没有把握时，要提醒用户核实。
- 语气专业、具体、亲切，像一个懂文化、懂设计、懂 AI 绘图提示词的创意伙伴。

当用户要求汇总、完成、生成方案或导出时，用 Markdown 输出《IP 视觉设定卡》，固定包含：
## IP 名称
## 一句话定位
## 文化溯源
## 角色设定
## 色彩风格板
## 视觉关键词
## 提示词包
### IP 形象提示词
### 海报提示词
### 场景提示词
### 文创产品提示词
## 文创延展清单
## 下一步优化建议
`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 不能为空' });
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(500).json({
      error: '服务器没有配置 DEEPSEEK_API_KEY。请在 Vercel 的 Environment Variables 里添加 DeepSeek API Key。'
    });
  }

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.slice(-20)
        ],
        temperature: 0.7,
        max_tokens: 2200
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('DeepSeek API error:', response.status, detail);
      return res.status(502).json({
        error: 'DeepSeek 服务暂时不可用，请检查 API Key、账户余额或稍后重试。'
      });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({ error: 'DeepSeek 没有返回有效内容，请稍后重试。' });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: '服务器请求失败，请稍后重试。' });
  }
};
