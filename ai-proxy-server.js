const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const LOCAL_CONFIG_PATH = path.join(ROOT_DIR, "local-ai.config.json");
const MAX_BODY_SIZE = 25 * 1024 * 1024;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";
  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": contentType,
  });
  fs.createReadStream(filePath).pipe(response);
}

function safeResolvePath(requestPath) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const decodedPath = decodeURIComponent(normalizedPath);
  const filePath = path.resolve(ROOT_DIR, `.${decodedPath}`);
  if (!filePath.startsWith(ROOT_DIR)) {
    return null;
  }
  return filePath;
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {};
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    request.on("data", (chunk) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        reject(new Error("body-too-large"));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("invalid-json"));
      }
    });

    request.on("error", reject);
  });
}

function getRemoteConfig() {
  const localConfig = readJsonFile(LOCAL_CONFIG_PATH);
  return {
    endpoint:
      process.env.REMOTE_AI_ENDPOINT ||
      localConfig.endpoint ||
      "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    apiKey: process.env.REMOTE_AI_API_KEY || localConfig.apiKey || "",
    apiKeyHeader: process.env.REMOTE_AI_API_KEY_HEADER || localConfig.apiKeyHeader || "",
    authScheme: process.env.REMOTE_AI_AUTH_SCHEME || localConfig.authScheme || "Bearer",
    model: process.env.REMOTE_AI_MODEL || localConfig.model || "doubao-seed-2-0-pro-260215",
  };
}

function getRemoteHeaders(config) {
  if (!config.apiKey) {
    return {};
  }

  if (config.apiKeyHeader) {
    return {
      [config.apiKeyHeader]: config.apiKey,
    };
  }

  const prefix = config.authScheme ? `${config.authScheme} ` : "";
  return {
    Authorization: `${prefix}${config.apiKey}`,
  };
}

function extractJsonBlock(content) {
  if (!content) {
    return "";
  }

  const text = String(content).trim();
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0].trim() : text;
}

function getMessageTextContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => item?.text || item?.content || "")
    .filter(Boolean)
    .join("\n");
}

function getResponsesTextContent(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text;
  }

  const outputs = Array.isArray(data?.output) ? data.output : [];
  return outputs
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map((item) => item?.text || item?.output_text || "")
    .filter(Boolean)
    .join("\n");
}

function parseAnalyzeResult(content) {
  const parsed = JSON.parse(extractJsonBlock(content));
  return {
    sections: Array.isArray(parsed?.sections) ? parsed.sections : [],
  };
}

function parseFollowUpResult(content) {
  const parsed = JSON.parse(extractJsonBlock(content));
  return {
    answer: String(parsed?.answer || "").trim(),
  };
}

function parseEfficiencyRepairResult(content) {
  const parsed = JSON.parse(extractJsonBlock(content));
  const section = parsed?.section && typeof parsed.section === "object" ? parsed.section : parsed;
  return {
    section:
      section && typeof section === "object"
        ? {
            theme: section.theme || "efficiency",
            title: String(section.title || ""),
            badge: String(section.badge || ""),
            body: Array.isArray(section.body) ? section.body : [],
            notes: Array.isArray(section.notes) ? section.notes : [],
            metrics: Array.isArray(section.metrics) ? section.metrics : [],
          }
        : null,
  };
}

function buildSectionSchema(isFlowTest) {
  return isFlowTest
    ? [
        "1. 任务完成度",
        "2. 效率与流畅度",
        "3. 理解与认知匹配",
        "4. 错误与容错性",
        "5. 主观体验与满意度",
      ]
    : [
        "1. 视觉顺序",
        "2. 任务完成度",
        "3. 效率与流畅度",
        "4. 理解与认知匹配",
        "5. 错误与容错性",
        "6. 主观体验与满意度",
      ];
}

function buildAnalyzePrompt(payload, options = {}) {
  const isFlowTest = payload?.route === "flow-test";
  const personaName = payload?.persona?.role || "目标用户";
  const personaDescription = payload?.persona?.description || "";
  const taskDescription = payload?.taskDescription || "";
  const actionDescriptions = Array.isArray(payload?.actionDescriptions) ? payload.actionDescriptions : [];
  const pageCount = Number(payload?.uploadedPageCount || 0);
  const retryReason = String(options?.retryReason || "").trim();
  const sectionsExample = isFlowTest
    ? [
        {
          theme: "completion",
          title: "1. 任务完成度",
          badge: "可完成",
          body: ["我能找到主要入口，但中间有一步让我停顿了一下。", "我大致能完成任务，不过过程中会犹豫是否走对了。"],
          notes: ["补强关键环节的引导和反馈，让用户更确定自己已经完成当前步骤。"],
          metrics: [],
        },
          {
            theme: "efficiency",
            title: "2. 效率与流畅度",
            badge: "流畅",
            body: [
              "步骤：①我先点击第一个流程页面进入上传状态——②我在中间的操作说明框里填写当前这一步要做什么——③我再继续上传右侧页面，整体链路是顺着走下来的。",
              "我基本能顺着流程往下走，但有些步骤的承接还可以更明确。",
              "如果每一步的动作提示更具体，我会少一点犹豫。",
            ],
            notes: ["减少冗余判断，强化相邻步骤之间的承接说明。"],
            metrics: [
              { value: "约 1 分钟", label: "完成时长" },
              { value: "0 次", label: "回退次数" },
            ],
        },
        {
          theme: "cognition",
          title: "3. 理解与认知匹配",
          badge: "清晰",
          body: ["我大体能看懂每个区域是在做什么。", "如果文案再贴近日常操作语言，我会更快理解下一步。"],
          notes: ["统一按钮和区域命名，减少用户自行猜测。"],
          metrics: [],
        },
        {
          theme: "errors",
          title: "4. 错误与容错性",
          badge: "轻微",
          body: ["有些地方我会担心自己点错，但还不至于完全不知道怎么退回。", "如果操作失败时提示更具体，我会更安心。"],
          notes: ["在关键操作前后增加明确的状态提示和可恢复路径。"],
          metrics: [],
        },
        {
          theme: "satisfaction",
          title: "5. 主观体验与满意度",
          badge: "一般",
          body: ["整体能用，但如果流程更顺一点，我会更愿意继续用。", "现在的体验还可以，不过有些地方让我觉得稍微费脑。"],
          notes: ["优化整体节奏和信息层次，降低用户的认知负担。"],
          metrics: [],
        },
      ]
    : [
        {
          theme: "visual",
          title: "1. 视觉顺序",
          badge: "良好",
          body: ["我第一眼先看到了右侧的主要操作区，左侧上传区域反而没有那么突出。", "我的视线会先找能完成任务的按钮，再回头确认页面里其他说明。"],
          notes: ["统一左右区域顶部基线，并加强首要任务入口的视觉引导。"],
          metrics: [],
        },
        {
          theme: "completion",
          title: "2. 任务完成度",
          badge: "可完成",
          body: ["我能找到完成任务需要的大部分入口。", "虽然能走完整个流程，但有一步让我不太确定是否已经完成。"],
          notes: ["对容易卡住的步骤增加更明确的引导和结果反馈。"],
          metrics: [],
        },
          {
            theme: "efficiency",
            title: "3. 效率与流畅度",
            badge: "流畅",
            body: [
              "步骤：①我先上传页面截图——②我再选择用户画像——③然后在任务描述里填写要完成的目标——④最后点击开始生成查看结果。",
              "我要先上传、再选用户、再填任务，步骤是能接受的，但还有压缩空间。",
              "有一个瞬间我差点点错按钮，导致我多看了一眼页面确认。",
            ],
            notes: ["减少犹豫点，进一步压缩完成任务所需的判断成本。"],
            metrics: [
              { value: "约 1 分钟", label: "完成时长" },
              { value: "1 次", label: "回退次数" },
            ],
        },
        {
          theme: "cognition",
          title: "4. 理解与认知匹配",
          badge: "清晰",
          body: ["“开始生成”这种说法我一看就懂，知道下一步会发生什么。", "有些区域虽然能猜到用途，但还不够像我平时熟悉的工具。"],
          notes: ["优化文案、图标和区域标识，让功能含义更直白。"],
          metrics: [],
        },
        {
          theme: "errors",
          title: "5. 错误与容错性",
          badge: "轻微",
          body: ["如果我还没上传图片，就会下意识想直接点开始。", "点错之后如果提示不够明确，我会怀疑是不是自己漏了什么。"],
          notes: ["对未完成条件做更明确的限制和即时提示，减少误操作。"],
          metrics: [],
        },
        {
          theme: "satisfaction",
          title: "6. 主观体验与满意度",
          badge: "一般",
          body: ["整体可以用，但如果布局再规整一点，我会更舒服。", "我会继续使用，但前提是关键操作更顺手一些。"],
          notes: ["从整体节奏、布局规整度和反馈清晰度上提升体验。"],
          metrics: [],
        },
      ];

  return [
    "你现在是一位真实的用户，请完全代入这个用户的真实视角去体验当前页面或流程。",
    "不要以分析师、设计师或产品经理身份说话，不要总结方法论。",
    "请像真实用户一样描述你看到什么、怎么理解、哪里犹豫、哪里顺手、哪里会卡住。",
    "输出必须是结构化 JSON。",
    "强制规则：你必须严格依据图片内容作答，不能凭空猜测。",
    "1. 你必须先完整观察页面截图的所有区域、按钮、输入框，理解真实布局。",
    "2. 你必须按照图片里真实存在的操作步骤来统计步数，不能编造。",
    "3. 你必须按照图片里真实的视觉层级描述第一眼看到什么、第二眼看到什么。",
    "4. 你必须按照图片里真实的按钮文字、区域文字来描述认知，不能自创文字。",
    "5. 你必须把图片里所有必须点击、填写、上传的真实操作一步一步数清楚，并完整写进步骤链里。",
    "6. 所有回答必须 100% 基于图片，不能脱离图片回答。",
    `测试类型：${isFlowTest ? "流程测试" : "页面测试"}`,
    `用户画像名称：${personaName}`,
    `用户画像详细描述：${personaDescription || "未填写"}`,
      `任务描述：${taskDescription || "未填写"}`,
      isFlowTest ? `已上传流程页面数：${pageCount || 0}` : "",
      actionDescriptions.length ? `流程操作说明：${actionDescriptions.join("；")}` : "",
      retryReason ? `补充纠正要求：${retryReason}` : "",
      "",
      "模块要求：",
    isFlowTest
      ? "流程测试不展示“视觉顺序”模块，只输出：任务完成度、效率与流畅度、理解与认知匹配、错误与容错性、主观体验与满意度。"
      : "页面测试需要输出：视觉顺序、任务完成度、效率与流畅度、理解与认知匹配、错误与容错性、主观体验与满意度。",
    !isFlowTest
      ? "视觉顺序：核心目标是描述用户第一眼看到什么、视线如何流动、视觉引导是否清晰。body 必须使用用户第一视角，例如“我第一眼先看到了右侧按钮，没注意到左侧上传区”。badge 只能是：良好 / 待优化 / 问题。notes 给出设计师可落地的优化建议。"
      : "",
    "任务完成度：核心目标是判断用户能否顺利完成任务，卡在哪个环节。body 至少 2 条，必须覆盖：是否能找到必要入口、任务能否完整走完或卡在哪一步、对“完成”的主观判断。badge 只能是：可完成 / 部分完成 / 无法完成。notes 给出未完成环节的改进方向。",
    "效率与流畅度：核心目标是描述操作步骤多少、是否冗余、是否有不必要的等待或犹豫。body 至少 2 条，必须覆盖：步骤是否繁琐、视觉或交互是否导致犹豫或回退、整体流畅感。badge 只能是：流畅 / 卡顿 / 低效。metrics 固定返回 2 项：完成时长、回退次数。notes 给出优化步骤和减少冗余的建议。",
    "效率与流畅度专项强制规则：",
    "1. 无论页面测试还是流程测试，都必须在 body 里写出完整、逐行、清晰的真实操作步骤。",
    "2. 每一步必须写明：点击哪里、输入哪里、上传哪里、选择哪里，严格对照图片里的真实控件名称。",
    "3. 步骤顺序必须严格遵循正常人操作流程，不能跳步，不能合并，不能漏步。",
    "4. 所有步骤必须来自图片真实控件，不准编造，不准脑补，不准省略。",
    "5. 不允许只写总结，必须逐条罗列完整链路。",
    "6. 不再单独输出关键步数指标，真实步骤数量全部体现在 body 第一条的步骤链里。",
    "7. body 的第一条必须使用这种格式输出完整步骤链：步骤：①xxx——②xxx——③xxx；如果步骤更多，就继续写 ④、⑤、⑥。",
    "8. 这条“步骤：①xxx——②xxx——③xxx”里必须写具体控件或区域名称，不能只写泛泛的总结。",
    "9. 如果真实步骤达到 3 步及以上，body 后续条目还要继续补充每一步里哪里顺、哪里卡、哪里会犹豫。",
    "理解与认知匹配：核心目标是判断用户是否能看懂界面文字、按钮、区域含义，是否符合认知习惯。body 至少 2 条，必须覆盖：文字或图标是否清晰易懂、区域功能是否容易误解、与日常使用习惯的匹配度。badge 只能是：清晰 / 模糊 / 困惑。notes 给出优化文案、图标、区域标识的建议。",
    "错误与容错性：核心目标是判断用户是否容易误操作，出错后能否快速发现和恢复。body 至少 2 条，必须覆盖：容易误点的操作、错误提示是否清晰、能否轻松撤销或回退。badge 只能是：无 / 轻微 / 严重。notes 给出防错和容错的具体方案。",
    "主观体验与满意度：核心目标是描述用户整体感受，是否愿意继续使用，情绪倾向。body 至少 2 条，必须覆盖：整体情绪、对界面或操作的好恶、与同类工具的对比感受（如果适用）。badge 只能是：满意 / 一般 / 不满。notes 给出提升整体体验的方向性建议。",
    "生成结果内容长度强制规则：",
    "1. body 不限制条数，不需要固定 2 条。",
    "2. 根据内容需要自由输出 2 到 10 条都可以。",
    "3. 复杂问题必须分段详细描述，不能刻意精简。",
    "4. 允许长句、多段落、多角度细化真实体验。",
    "5. 内容越详细、越真实越好，不能刻意变短。",
    "请只返回 JSON，不要输出额外解释。",
    "JSON 格式如下：",
    JSON.stringify(
      {
        sections: sectionsExample,
      },
      null,
      2,
    ),
    "规则：",
    "1. body 必须是字符串数组，每个模块至少 2 条，最多可以详细展开到 10 条。",
    "2. 所有 body 必须尽量使用用户第一视角，比如“我会… / 我以为… / 我没注意到… / 我会犹豫…”。",
    "3. 复杂问题必须详细展开，允许长句和多角度描述，不要为了简洁而省略真实体验。",
    "4. notes 必须是字符串数组，内容要是可落地的优化建议。",
    "5. metrics 只有效率与流畅度模块返回，而且必须固定为：完成时长、回退次数；其他模块返回空数组。",
    "6. 效率与流畅度模块的 body 必须逐条列清完整真实步骤，不允许只写总结；第一条必须是“步骤：①xxx——②xxx——③xxx”这种链式格式。",
    "7. theme 必须严格从示例中选择，不要自造，也不要缺失。",
    "8. title 必须保持示例中的顺序和命名。",
    "9. 所有内容必须使用简体中文。",
    "10. 不要输出 Markdown，不要输出解释，不要输出 JSON 以外的任何内容。",
  ]
      .filter(Boolean)
      .join("\n");
  }

function buildEfficiencyRepairPrompt(payload, sections, reason) {
  const isFlowTest = payload?.route === "flow-test";
  const personaName = payload?.persona?.role || "目标用户";
  const personaDescription = payload?.persona?.description || "";
  const taskDescription = payload?.taskDescription || "";
  const currentEfficiency = Array.isArray(sections) ? sections.find((section) => section?.theme === "efficiency") : null;
  const targetTitle = isFlowTest ? "2. 效率与流畅度" : "3. 效率与流畅度";

  return [
    "你现在只需要重写一个模块：效率与流畅度。",
    "你必须严格依据图片中的真实内容回答，不能猜测，不能脑补，不能新增图片中不存在的按钮、区域、步骤。",
    "你必须继续扮演这个用户本人，用第一人称描述真实体验。",
    `用户画像名称：${personaName}`,
    `用户画像详细描述：${personaDescription || "未填写"}`,
    `任务描述：${taskDescription || "未填写"}`,
    `纠正原因：${reason}`,
    "",
    "这是当前不合格的效率与流畅度模块，请你不要照抄，而是纠正它：",
    JSON.stringify(currentEfficiency || {}, null, 2),
    "",
    "你现在必须只返回一个 JSON 对象，格式如下：",
    JSON.stringify(
      {
        section: {
          theme: "efficiency",
          title: targetTitle,
          badge: "流畅",
          body: [
            "步骤：①xxx——②xxx——③xxx",
            "我在第 x 步的时候会……",
            "我在第 x 步和第 x+1 步之间会不会犹豫……",
          ],
            notes: ["给设计师的可执行优化建议"],
            metrics: [
              { value: "约 40 秒", label: "完成时长" },
              { value: "0 次", label: "回退次数" },
            ],
        },
      },
      null,
      2,
    ),
    "硬性要求：",
    "1. body 第一条必须是：步骤：①xxx——②xxx——③xxx，如果有更多步骤继续写④、⑤、⑥。",
    "2. 每一步必须写真实控件或真实区域名称，必须来自图片本身。",
    "3. 不允许把多个步骤合并成一句模糊总结。",
    "4. body 后续条目必须继续解释哪一步顺、哪一步卡、哪一步会犹豫。",
    "5. 不再单独输出关键步数，真实步骤数量全部体现在第一条步骤链里。",
    "6. 如果图片里看不清某一步，就明确写“根据当前图片无法判断”，不能编造。",
    "7. 只返回 JSON，不要输出解释，不要输出 Markdown。",
  ].join("\n");
}

function buildFollowUpPrompt(payload) {
  return [
    "你现在仍然要继续扮演同一个真实用户，而不是分析师。",
    "请基于原始页面或流程截图、原始用户画像、原始任务描述，以及当前的追问问题继续回答。",
    "回答时必须站在这个用户本人的角度，用第一人称表达自己的感受、理解、犹豫和判断。",
    "不要跳出这个用户身份，不要用分析师口吻，不要写成设计建议总结。",
    "追问专属铁律，违反直接无效：",
    "1. 所有追问回答，必须严格绑定本次原始页面截图、用户画像、用户任务，严禁新增未出现的按钮、区域、操作。",
    "2. 不知道或看不清的内容，直接说“根据当前页面无法判断”，绝不猜测，绝不脑补细节。",
    "3. 不得篡改初次测试的关键数据（步数、区域名称、问题点），只能基于已有内容细化解释。",
    "4. 语气必须延续当前设定的用户画像，不切换分析师身份，不堆砌专业术语。",
    "强制规则：你必须严格依据图片内容作答，不能凭空猜测。",
    "1. 你必须先完整观察页面截图的所有区域、按钮、输入框，理解真实布局。",
    "2. 你必须按照图片里真实存在的操作步骤来统计步数，不能编造。",
    "3. 你必须按照图片里真实的视觉层级描述第一眼看到什么、第二眼看到什么。",
    "4. 你必须按照图片里真实的按钮文字、区域文字来描述认知，不能自创文字。",
    "5. 你必须把图片里所有必须点击、填写、上传的真实操作一步一步数清楚，并完整写进步骤链里。",
    "6. 所有回答必须 100% 基于图片，不能脱离图片回答。",
    "如果图片信息不足以支撑非常确定的判断，可以明确说明你是基于当前截图做出的推断，但不能编造图片里不存在的内容。",
    "请继续围绕原来的页面、原来的用户、原来的任务来回答这次追问，不要偏离上下文。",
    `用户画像：${payload?.persona?.role || "目标用户"}`,
    payload?.persona?.description ? `用户画像描述：${payload.persona.description}` : "",
    `任务描述：${payload?.taskDescription || "未填写"}`,
    `追问问题：${payload?.question || ""}`,
    "请只返回 JSON，不要输出额外解释。",
    JSON.stringify(
      {
        answer: "这里是一段 80 到 180 字之间、使用第一人称、基于图片和原任务上下文的简体中文回答。",
      },
      null,
      2,
    ),
  ].join("\n");
}

function collectAnalyzeImages(payload) {
  const images = [];

  if (payload?.screenshot?.dataUrl) {
    images.push({
      label: `页面截图：${payload.screenshot.name || "未命名截图"}`,
      url: payload.screenshot.dataUrl,
    });
  }

  const uploadedNodes = Array.isArray(payload?.uploadedNodes) ? payload.uploadedNodes : [];
  uploadedNodes.forEach((node, index) => {
    if (!node?.imageDataUrl) {
      return;
    }

    images.push({
      label: `流程页面 ${index + 1}：${node.imageName || `节点${index + 1}`}`,
      url: node.imageDataUrl,
    });
  });

  return images.slice(0, 8);
}

function buildChatCompletionsBody(action, payload, config, options = {}) {
  const prompt =
    options.promptOverride ||
    (action === "followup" ? buildFollowUpPrompt(payload) : buildAnalyzePrompt(payload, options));
  const imageParts = collectAnalyzeImages(payload).flatMap((item) => [
        { type: "text", text: item.label },
        { type: "image_url", image_url: { url: item.url } },
      ]);

  return {
    model: config.model,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: "你必须严格按要求返回 JSON。",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...imageParts,
        ],
      },
    ],
  };
}

function buildResponsesBody(action, payload, config, options = {}) {
  const prompt =
    options.promptOverride ||
    (action === "followup" ? buildFollowUpPrompt(payload) : buildAnalyzePrompt(payload, options));
  const imageParts = collectAnalyzeImages(payload).flatMap((item) => [
        { type: "input_text", text: item.label },
        { type: "input_image", image_url: item.url },
      ]);

  return {
    model: config.model,
    instructions: "你必须严格按要求返回 JSON。",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...imageParts,
        ],
      },
    ],
  };
}

function buildRemoteRequestBody(action, payload, config, options = {}) {
  if (config.endpoint.includes("/responses")) {
    return buildResponsesBody(action, payload, config, options);
  }

  return buildChatCompletionsBody(action, payload, config, options);
}

function parseRemoteResponse(action, data, config, options = {}) {
  const rawContent = config.endpoint.includes("/responses")
    ? getResponsesTextContent(data)
    : getMessageTextContent(data?.choices?.[0]?.message?.content);

  if (typeof options.customParser === "function") {
    return options.customParser(rawContent);
  }

  if (action === "followup") {
    return parseFollowUpResult(rawContent);
  }

  return parseAnalyzeResult(rawContent);
}

function countStepMarkers(text) {
  const markers = String(text || "").match(/[①②③④⑤⑥⑦⑧⑨⑩]/g);
  return markers ? markers.length : 0;
}

function validateAnalyzeSections(sections) {
  if (!Array.isArray(sections) || !sections.length) {
    return { ok: false, reason: "没有返回有效的 sections 数组。" };
  }

  const efficiencySection = sections.find((section) => section?.theme === "efficiency");
  if (!efficiencySection) {
    return { ok: false, reason: "缺少效率与流畅度模块。" };
  }

  const body = Array.isArray(efficiencySection.body) ? efficiencySection.body.map((item) => String(item || "").trim()) : [];
  const firstLine = body[0] || "";
  if (!/^步骤：①.+——②.+/.test(firstLine)) {
    return {
      ok: false,
      reason: "效率与流畅度模块的第一条 body 没有严格按“步骤：①xxx——②xxx——③xxx”格式输出完整步骤链。",
    };
  }

  const stepCount = countStepMarkers(firstLine);
  if (stepCount < 2) {
    return {
      ok: false,
      reason: "效率与流畅度模块的步骤链没有清晰列出至少两步真实操作。",
    };
  }

  return { ok: true, reason: "" };
}

async function requestRemoteOnce(action, payload, config, options = {}) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...getRemoteHeaders(config),
    },
    body: JSON.stringify(buildRemoteRequestBody(action, payload || {}, config, options)),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `remote-http-${response.status}`);
  }

  return parseRemoteResponse(action, data, config, options);
}

function replaceEfficiencySection(sections, replacementSection) {
  if (!replacementSection || !Array.isArray(sections)) {
    return sections;
  }

  return sections.map((section) => (section?.theme === "efficiency" ? replacementSection : section));
}

async function proxyToRemote(body) {
  const config = getRemoteConfig();
  if (!config.endpoint || !config.apiKey) {
    return null;
  }

  const action = body?.action === "followup" ? "followup" : "analyze";
  const payload = body?.payload || {};
  const firstResult = await requestRemoteOnce(action, payload, config);

  if (action === "followup") {
    return firstResult;
  }

  const firstValidation = validateAnalyzeSections(firstResult?.sections);
  if (firstValidation.ok) {
    return firstResult;
  }

  const repairedEfficiency = await requestRemoteOnce(action, payload, config, {
    promptOverride: buildEfficiencyRepairPrompt(payload, firstResult?.sections, firstValidation.reason),
    customParser: parseEfficiencyRepairResult,
  });
  const mergedResult = {
    ...firstResult,
    sections: replaceEfficiencySection(firstResult?.sections || [], repairedEfficiency?.section),
  };
  const secondValidation = validateAnalyzeSections(mergedResult?.sections);
  if (secondValidation.ok) {
    return mergedResult;
  }

  const thirdResult = await requestRemoteOnce(action, payload, config, {
    retryReason: `${secondValidation.reason} 这已经是最后一次纠正。你必须只依据图片中的真实控件和真实顺序输出效率与流畅度。第一条 body 必须原样采用这种格式：步骤：①xxx——②xxx——③xxx——④xxx。不要写概括句代替步骤链，不要省略任何关键操作。不要输出关键步数这项指标。`,
  });
  const thirdValidation = validateAnalyzeSections(thirdResult?.sections);
  if (thirdValidation.ok) {
    return thirdResult;
  }

  throw new Error(`analyze-format-invalid: ${thirdValidation.reason}`);
}

function visualIcon(type) {
  const icons = {
    visual:
      '<svg viewBox="0 0 24 24" focusable="false"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.7"></circle></svg>',
    completion:
      '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.3 2.2 2.2 4.8-4.8"></path></svg>',
    efficiency:
      '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
    cognition:
      '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M9.8 9.4a2.6 2.6 0 1 1 4 2.2c-.9.5-1.3 1-1.3 1.9"></path><path d="M12 17h.01"></path></svg>',
    errors:
      '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5"></path><path d="M12 16h.01"></path></svg>',
    satisfaction:
      '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3.5 14.5 8l5 .7-3.6 3.5.9 5-4.3-2.3-4.3 2.3.9-5L5.5 8.7l5-.7L12 3.5Z"></path></svg>',
  };

  return icons[type] || icons.visual;
}

function flowIcon(type) {
  const icons = {
    completion:
      '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.3 2.2 2.2 4.8-4.8"></path></svg>',
    efficiency:
      '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
    cognition:
      '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M9.8 9.4a2.6 2.6 0 1 1 4 2.2c-.9.5-1.3 1-1.3 1.9"></path><path d="M12 17h.01"></path></svg>',
    errors:
      '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5"></path><path d="M12 16h.01"></path></svg>',
    satisfaction:
      '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3.5 14.5 8l5 .7-3.6 3.5.9 5-4.3-2.3-4.3 2.3.9-5L5.5 8.7l5-.7L12 3.5Z"></path></svg>',
  };

  return icons[type] || icons.completion;
}

function buildPageTestSections(payload) {
  const personaName = payload?.persona?.role || "目标用户";
  const task = String(payload?.taskDescription || "当前任务").trim() || "当前任务";

  return [
    {
      theme: "visual",
      title: "1. 视觉顺序",
      icon: visualIcon("visual"),
      badge: "视觉路径清晰",
      body: [
        `第一眼通常会注意到与“${task}”直接相关的核心区域，${personaName} 能较快确认页面主目标。`,
        "第二层关注会落到主要按钮、输入区和关键提示文案上，视觉层级整体比较清楚。",
      ],
      notes: ["建议继续保持主路径元素的对比度和留白优势，避免次要模块抢占注意力。"],
      metrics: [],
    },
    {
      theme: "completion",
      title: "2. 任务完成度",
      icon: visualIcon("completion"),
      badge: "成功完成",
      body: [
        `${personaName} 基本可以在较少引导下完成“${task}”相关任务。`,
        "当前流程中的主按钮和任务入口是可理解的，完成任务的阻力不大。",
      ],
      notes: ["关键节点基本完整，若补足更明确的反馈信息，完成体验会更稳定。"],
      metrics: [],
    },
    {
      theme: "efficiency",
      title: "3. 效率与流畅度",
      icon: visualIcon("efficiency"),
      badge: "",
      body: [
        "整体操作路径相对直接，用户通常不需要频繁回退或重复确认。",
        "如果进一步减少次级说明的阅读负担，效率还能继续提升。",
      ],
        notes: ["流程评价：当前路径自然顺滑，适合作为一轮可用性分析的基础结果。"],
        metrics: [
          { value: "2.4 分钟", label: "完成时长" },
          { value: "0 次", label: "回退次数" },
        ],
    },
    {
      theme: "cognition",
      title: "4. 理解与认知匹配",
      icon: visualIcon("cognition"),
      badge: "理解程度：良好",
      body: [
        `${personaName} 对界面结构的理解速度较快，能把页面元素和“${task}”目标建立关联。`,
        "局部文案若再贴近真实用户语言，会进一步降低理解成本。",
      ],
      notes: ["建议将关键操作文案写得更直接，减少用户自行解释界面含义的负担。"],
      metrics: [],
    },
    {
      theme: "errors",
      title: "5. 错误与容错性",
      icon: visualIcon("errors"),
      badge: "",
      body: [
        "当前主路径误触风险不高，但覆盖结果、返回首页等高风险动作仍建议保持确认机制。",
        "若未来增加更多分支操作，建议补足更明确的错误提示与恢复指引。",
      ],
      notes: ["容错设计建议：对删除、返回、重新生成等操作持续保留二次确认。"],
      metrics: [],
    },
    {
      theme: "satisfaction",
      title: "6. 主观体验与满意度",
      icon: visualIcon("satisfaction"),
      badge: "整体体验：轻松高效",
      body: [
        `${personaName} 往往会觉得页面主任务路径清楚，知道下一步该做什么。`,
        "只要保持当前的层级关系和反馈机制，整体满意度会维持在较高水平。",
      ],
      notes: ["体验评价：整体使用门槛较低，适合继续做更深入的细节优化。"],
      metrics: [],
    },
  ];
}

function buildFlowTestSections(payload) {
  const personaName = payload?.persona?.role || "目标用户";
  const task = String(payload?.taskDescription || "当前流程任务").trim() || "当前流程任务";
  const pageCount = Math.max(Number(payload?.uploadedPageCount) || 1, 1);
  const actionCount = Array.isArray(payload?.actionDescriptions) ? payload.actionDescriptions.length : 0;

  return [
    {
      theme: "completion",
      title: "1. 任务完成度",
      icon: flowIcon("completion"),
      badge: "整体可完成",
      body: [
        `${personaName} 能够顺着当前流程完成“${task}”相关任务，关键页面之间的承接关系比较清晰。`,
        `当前共涉及 ${pageCount} 个流程页面和 ${Math.max(actionCount, 1)} 条关键操作说明，主链路没有明显断点。`,
      ],
      notes: ["建议继续补足空白页面或模糊说明，避免用户在跨页跳转时出现理解停顿。"],
      metrics: [],
    },
    {
      theme: "efficiency",
      title: "2. 效率与流畅度",
      icon: flowIcon("efficiency"),
      badge: "",
      body: [
        "流程中的操作提示较集中，用户可以比较快判断下一步要去哪里。",
        "如果相邻页面的说明语义再统一一些，整体切换效率还可以继续提升。",
      ],
        notes: ["流程评价：当前链路连续性较好，适合作为完整流程测试的基础版本。"],
        metrics: [
          { value: `${(pageCount * 1.2 + Math.max(actionCount, 1) * 0.6).toFixed(1)} 分钟`, label: "完成时长" },
          { value: `${Math.max(0, pageCount - 2)} 次`, label: "回退次数" },
        ],
    },
    {
      theme: "cognition",
      title: "3. 理解与认知匹配",
      icon: flowIcon("cognition"),
      badge: "理解成本较低",
      body: [
        `${personaName} 对流程目标理解较快，尤其当相邻页面之间的操作说明足够明确时，几乎不需要额外猜测。`,
        "如果某个节点没有操作说明，用户会更依赖页面截图自行判断，理解成本会略有上升。",
      ],
      notes: ["建议让每条操作说明尽量贴近真实点击动作，减少抽象描述。"],
      metrics: [],
    },
    {
      theme: "errors",
      title: "4. 错误与容错性",
      icon: flowIcon("errors"),
      badge: "",
      body: [
        "当前流程的主要风险点在于节点变多后，用户可能忽略其中某一条连接关系或误解某一步的执行对象。",
        "如果后续支持高亮关键步骤、重新排序或补充提示，容错体验会更好。",
      ],
      notes: ["建议在后续版本补足节点异常提示、步骤校验和跨页回退说明。"],
      metrics: [],
    },
    {
      theme: "satisfaction",
      title: "5. 主观体验与满意度",
      icon: flowIcon("satisfaction"),
      badge: "流程感知清晰",
      body: [
        `${personaName} 会觉得当前流程结构是有条理的，适合用来理解完整任务的先后顺序。`,
        "当节点数继续增加时，建议用更明显的分组承接不同阶段，否则满意度会随着认知负担上升而下降。",
      ],
      notes: ["整体评价：当前流程编排清楚，适合继续进入保存与复盘环节。"],
      metrics: [],
    },
  ];
}

function buildFollowUpAnswer(payload) {
  const question = String(payload?.question || "").trim();
  const personaName = payload?.persona?.role || "该用户";
  const routeName = payload?.route === "flow-test" ? "流程" : "页面";
  const prefix = question ? `针对“${question}”这个问题，` : "";
  return `${prefix}${personaName} 更可能受当前${routeName}中的提示方式、操作层级和反馈强度影响。建议重点观察用户是在理解目标前停顿，还是在执行动作后缺少反馈；如果迟疑集中出现在同一位置，通常说明那一段的信息还不够明确。`;
}

function buildMockResponse(body) {
  if (body.action === "followup") {
    return {
      answer: buildFollowUpAnswer(body.payload),
    };
  }

  return {
    sections:
      body?.payload?.route === "flow-test"
        ? buildFlowTestSections(body.payload)
        : buildPageTestSections(body.payload),
  };
}

async function handleAiRequest(request, response) {
  try {
    const body = await readRequestBody(request);
    const remoteResult = await proxyToRemote(body);
    sendJson(response, 200, remoteResult || buildMockResponse(body));
  } catch (error) {
    const statusCode =
      error.message === "invalid-json" ? 400 : error.message === "body-too-large" ? 413 : 500;
    sendJson(response, statusCode, {
      message:
        error.message === "invalid-json"
          ? "Invalid JSON body"
          : error.message === "body-too-large"
            ? "Request body too large"
            : error.message || "AI server error",
    });
  }
}

function handleStaticRequest(request, response, pathname) {
  const filePath = safeResolvePath(pathname);
  if (!filePath) {
    sendJson(response, 403, { message: "Forbidden" });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(response, 404, { message: "Not found" });
      return;
    }

    sendFile(response, filePath);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Origin": "*",
    });
    response.end();
    return;
  }

  if (requestUrl.pathname === "/api/ai" && request.method === "POST") {
    await handleAiRequest(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/health" && request.method === "GET") {
    const config = getRemoteConfig();
    sendJson(response, 200, {
      ok: true,
      port: PORT,
      remoteConfigured: Boolean(config.endpoint && config.apiKey),
      remoteEndpoint: config.endpoint,
      remoteModel: config.model,
    });
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    handleStaticRequest(request, response, requestUrl.pathname);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`AI usability workspace server is running at http://localhost:${PORT}`);
});
