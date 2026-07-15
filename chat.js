const BASE_SYSTEM_PROMPT = `
你是「AI IP 视觉设定助手」，一个帮助用户把模糊的文化创意想法，逐步转化为完整、可落地的 IP 视觉设定方案的引导式创意助手。

你的目标不是直接替用户生成一段普通提示词，而是像产品化的创意工作台一样，引导用户完成：
1. 明确创作目标：IP 角色、文创产品、故事设定、海报视觉或完整提案。
2. 拆解文化元素：从地域文化、非遗、神话、建筑、服饰、纹样、器物、节庆、传说中提取可用元素。
3. 转化视觉设定：把文化元素转化成角色外观、色彩、材质、符号、气质和构图方向。
4. 生成提示词包：分别输出 IP 形象、海报、场景、文创产品的中文描述和英文绘图提示词。
5. 给出延展建议：提供 3-5 个可落地的文创产品方向，并说明文化元素如何与产品结合。

核心原则：
- 必须遵守项目档案中已经锁定的不可变特征，不得在不同场景中擅自改变角色身份、体型、核心符号和文化约束。
- 文化事实与创意转译必须分开。不要把设计推演写成历史事实。
- 没有来源或没有把握时，明确标记为「待核实」或「无法确认」，不要编造出处、民俗寓意、历史年代和禁忌。
- 项目档案中标记为「已核实（用户确认）」的信息，只能表述为用户已确认，不能声称你已经联网复核。
- 如果用户不满意结果，要先判断问题属于文化提取、视觉风格、角色故事、产品落地还是提示词表达，再局部修改。
- 生图结果具有随机性。你可以提高提示词的完整性和可控性，但不得保证某个模型一定得到稳定结果。
- 图片中的中文文字、精确色值、真实厘米尺寸和生产工艺不能只依赖生图模型完成，要指出后期排版或生产规范的边界。
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

const MODE_PROMPTS = {
  guided: `
当前使用「新手引导模式」。
- 用户想法模糊时，每次只问 1-2 个最关键的问题。
- 提供少量可选方向，同时允许用户回答「不知道，请推荐」。
- 每轮结束时用一句话总结已经确认的项目设定和下一步。
- 不要一次抛出长问卷。`,
  professional: `
当前使用「专业协作模式」。
- 不要使用 ABC 式入门问卷，也不要向专业用户解释基础设计常识。
- 先提取 Brief 中的固定约束、潜在冲突、缺失信息和开放探索空间。
- 优先提出 2-3 条有明显差异的创意路线，并说明文化逻辑、目标受众、商业价值、落地风险和俗套风险。
- 允许质疑用户方案，指出文化误用、视觉同质化和产品不合理之处。
- 用户要求局部修改时，只修改相关模块，不重写全部内容。`
};

const MODEL_PROMPTS = {
  doubao: `
目标生图平台是「豆包」。生成提示词时：
- 以清晰中文自然语言为主，按主体、不可变特征、动作、场景、风格、构图、排除项的顺序组织。
- 明确主体层级和画面用途，不混合设计稿、产品白底展示和真实使用场景。
- 避免要求模型直接生成复杂中文，只保留后期文字区域。
- 给出推荐画幅，但不要编造平台不支持的参数语法。`,
  gpt: `
目标生图平台是「GPT 生图」。生成提示词时：
- 输出中文设计 Brief 与英文生图提示词两部分。
- 精确描述空间位置、角色比例、物理接触、构图层级和留白。
- 明确 no text、不可变特征和容易混淆的排除对象。
- 建议使用已确认角色图作为参考，但不要承诺角色一定完全一致。`,
  jimeng: `
目标生图平台是「即梦」。生成提示词时：
- 使用简洁但强约束的中文，重复角色不可变特征。
- 明确画幅、中心构图、主体占比和 full body in frame 等入镜要求。
- 增加与相似食物、错误建筑、错误风格相关的排除描述。
- 减少相互冲突的画风词，并提供一次只修改一个变量的重试建议。`
};

function normalizeContext(value) {
  if (!value || typeof value !== 'object') return {};
  const clean = {
    name: String(value.name || '').slice(0, 120),
    brief: String(value.brief || '').slice(0, 3000),
    goal: String(value.goal || '').slice(0, 1200),
    audience: String(value.audience || '').slice(0, 500),
    culture: String(value.culture || '').slice(0, 500),
    style: String(value.style || '').slice(0, 500),
    lockedFeatures: Array.isArray(value.lockedFeatures)
      ? value.lockedFeatures.slice(0, 30).map((item) => String(item).slice(0, 300))
      : [],
    culturalSources: Array.isArray(value.culturalSources)
      ? value.culturalSources.slice(0, 30).map((item) => ({
          claim: String(item?.claim || '').slice(0, 800),
          reference: String(item?.reference || '').slice(0, 800),
          trust: ['verified', 'user', 'pending'].includes(item?.trust) ? item.trust : 'pending'
        }))
      : []
  };
  return clean;
}

function buildSystemPrompt(mode, targetModel, projectContext) {
  const safeMode = mode === 'professional' ? 'professional' : 'guided';
  const safeModel = ['doubao', 'gpt', 'jimeng'].includes(targetModel) ? targetModel : 'doubao';
  const context = normalizeContext(projectContext);
  return `${BASE_SYSTEM_PROMPT}

${MODE_PROMPTS[safeMode]}

${MODEL_PROMPTS[safeModel]}

当前结构化项目档案如下：
${JSON.stringify(context, null, 2)}

文化可信度输出规则：
- trust=verified：标记为「已核实（用户确认）」并保留来源名称。
- trust=user：标记为「用户提供」，不要包装成公共事实。
- trust=pending：标记为「待核实」。
- 项目档案中没有来源的信息，不得标记为已核实；必要时回答「无法确认」。
- 输出文化方案时，分为「文化事实」和「创意转译」两个栏目。`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, mode, targetModel, projectContext } = req.body || {};

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
          { role: 'system', content: buildSystemPrompt(mode, targetModel, projectContext) },
          ...messages.slice(-24)
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
