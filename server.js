const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
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
  return {
    endpoint: process.env.REMOTE_AI_ENDPOINT || "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    apiKey: process.env.REMOTE_AI_API_KEY || "",
    apiKeyHeader: process.env.REMOTE_AI_API_KEY_HEADER || "",
    authScheme: process.env.REMOTE_AI_AUTH_SCHEME || "Bearer",
    model: process.env.REMOTE_AI_MODEL || "doubao-pro-32k",
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

  const fencedMatch = String(content).match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const objectMatch = String(content).match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0].trim() : String(content).trim();
}

function buildAnalyzePrompt(body) {
  const payload = body?.payload || {};
  const route = payload.route === "flow-test" ? "flow-test" : "page-test";
  const isFlowTest = route === "flow-test";
  const titlePrefix = isFlowTest ? "流程测试" : "页面测试";
  const personaName = payload?.persona?.role || "目标用户";
  const personaDescription = payload?.persona?.description || "";
  const taskDescription = payload?.taskDescription || "";
  const actionDescriptions = Array.isArray(payload?.actionDescriptions) ? payload.actionDescriptions : [];
  const uploadedPageCount = Number(payload?.uploadedPageCount || 0);
  const uploadedNodes = Array.isArray(payload?.uploadedNodes) ? payload.uploadedNodes : [];
  const imageInfo = payload?.image
    ? `页面截图名称：${payload.image.name || "未命名"}。`
    : uploadedNodes.length
      ? `流程页面数量：${uploadedPageCount || uploadedNodes.length}。`
      : "未提供图片元数据。";

  const sectionSchema = isFlowTest
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

  const allowedThemes = isFlowTest
    ? ["completion", "efficiency", "cognition", "errors", "satisfaction"]
    : ["visual", "completion", "efficiency", "cognition", "errors", "satisfaction"];

  return [
    {
      role: "system",
      content:
        "你是一名资深可用性测试分析师。你必须只返回 JSON，不要输出任何额外解释、前后缀或 Markdown 代码块。",
    },
    {
      role: "user",
      content: [
        `请基于以下${titlePrefix}信息，输出结构化可用性分析结果。`,
        `测试类型：${titlePrefix}`,
        `用户画像：${personaName}`,
        personaDescription ? `用户画像描述：${personaDescription}` : "",
        `任务描述：${taskDescription || "未填写"}`,
        imageInfo,
        actionDescriptions.length ? `流程操作说明：${actionDescriptions.join("；")}` : "",
        "请严格返回 JSON，格式如下：",
        JSON.stringify(
          {
            sections: sectionSchema.map((title, index) => ({
              theme: allowedThemes[index],
              title,
              badge: index % 2 === 0 ? "示例标签" : "",
              body: ["段落1", "段落2"],
              notes: ["补充建议"],
              metrics: title.includes("效率")
                ? [
                    { value: "2.5 分钟", label: "完成时长" },
                    { value: "4 步", label: "关键步数" },
                    { value: "0 次", label: "回退次数" },
                  ]
                : [],
            })),
          },
          null,
          2,
        ),
        "规则：",
        "1. body 必须是字符串数组，至少 2 条。",
        "2. notes 必须是字符串数组，可以为空数组。",
        "3. metrics 仅效率模块返回，其余模块返回空数组。",
        "4. theme 必须从允许值中选择，不要自造。",
        "5. 所有内容使用简体中文。",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

function buildFollowUpPrompt(body) {
  const payload = body?.payload || {};
  const personaName = payload?.persona?.role || "目标用户";
  const taskDescription = payload?.taskDescription || "";
  const question = payload?.question || "";

  return [
    {
      role: "system",
      content: "你是一名资深可用性测试分析师。你必须只返回 JSON，不要输出任何额外解释、前后缀或 Markdown 代码块。",
    },
    {
      role: "user",
      content: [
        "请基于当前测试上下文，回答用户的进一步追问。",
        `用户画像：${personaName}`,
        `任务描述：${taskDescription || "未填写"}`,
        `追问：${question}`,
        "请严格返回 JSON，格式如下：",
        JSON.stringify(
          {
            answer: "这里是一段 80 到 180 字之间的简体中文回答。",
          },
          null,
          2,
        ),
        "规则：",
        "1. 只返回 answer 字段。",
        "2. 回答要具体，结合用户行为、理解、反馈和流程/页面结构。",
        "3. 使用简体中文。",
      ].join("\n"),
    },
  ];
}

function normalizeRemoteAiResponse(action, data) {
  const content = data?.choices?.[0]?.message?.content || "";
  const jsonText = extractJsonBlock(content);
  const parsed = JSON.parse(jsonText);

  if (action === "followup") {
    return {
      answer: String(parsed?.answer || "").trim(),
    };
  }

  return {
    sections: Array.isArray(parsed?.sections) ? parsed.sections : [],
  };
}

async function proxyToRemote(body) {
  const remote = getRemoteConfig();
  if (!remote.endpoint || !remote.apiKey) {
    return null;
  }

  const action = body?.action === "followup" ? "followup" : "analyze";
  const messages = action === "followup" ? buildFollowUpPrompt(body) : buildAnalyzePrompt(body);

  const response = await fetch(remote.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...getRemoteHeaders(remote),
    },
    body: JSON.stringify({
      model: remote.model,
      messages,
      temperature: 0.4,
      response_format: {
        type: "json_object",
      },
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || `remote-http-${response.status}`);
  }

  return normalizeRemoteAiResponse(action, data);
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
  const duration = "2.4 分钟";
  const clicks = "4 步";
  const backtracks = "0 次";

  return [
    {
      theme: "visual",
      title: "1. 视觉顺序",
      icon: visualIcon("visual"),
      badge: "视觉路径清晰",
      body: [
        `第一眼通常会注意到与“${task}”直接相关的核心区域，${personaName} 能较快确认页面主目标。`,
        "第二层关注会落到主要按钮、输入区和关键提示文案上，视觉层级整体比较清楚。",
        "最后才会去处理次要说明和辅助信息，因此主任务并不会被明显干扰。",
      ],
      notes: ["建议继续保持主路径元素的对比度和留白优势，避免次要模块抢占注意力。"],
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
    },
    {
      theme: "efficiency",
      title: "3. 效率与流畅度",
      icon: visualIcon("efficiency"),
      body: [
        "整体操作路径相对直接，用户通常不需要频繁回退或重复确认。",
        "如果进一步减少次级说明的阅读负担，效率还能继续提升。",
      ],
      metrics: [
        { value: duration, label: "完成时长" },
        { value: clicks, label: "点击步数" },
        { value: backtracks, label: "回退次数" },
      ],
      notes: ["流程评价：当前路径自然顺滑，适合作为一轮可用性分析的基础结果。"],
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
    },
    {
      theme: "errors",
      title: "5. 错误与容错性",
      icon: visualIcon("errors"),
      body: [
        "当前主路径误触风险不高，但覆盖结果、返回首页等高风险动作仍建议保持确认机制。",
        "若未来增加更多分支操作，建议补足更明确的错误提示与恢复指引。",
      ],
      notes: ["容错设计建议：对删除、返回、重新生成等操作持续保留二次确认。"],
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
    },
  ];
}

function buildFlowTestSections(payload) {
  const personaName = payload?.persona?.role || "目标用户";
  const task = String(payload?.taskDescription || "当前流程任务").trim() || "当前流程任务";
  const pageCount = Math.max(Number(payload?.uploadedPageCount) || 1, 1);
  const actionCount = Array.isArray(payload?.actionDescriptions) ? payload.actionDescriptions.length : 0;
  const duration = `${(pageCount * 1.2 + Math.max(actionCount, 1) * 0.6).toFixed(1)} 分钟`;
  const clicks = `${Math.max(actionCount + 1, pageCount)} 步`;
  const backtracks = `${Math.max(0, pageCount - 2)} 次`;

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
    },
    {
      theme: "efficiency",
      title: "2. 效率与流畅度",
      icon: flowIcon("efficiency"),
      body: [
        "流程中的操作提示较集中，用户可以比较快判断下一步要去哪里。",
        "如果相邻页面的说明语义再统一一些，整体切换效率还可以继续提升。",
      ],
      metrics: [
        { value: duration, label: "完成时长" },
        { value: clicks, label: "关键步数" },
        { value: backtracks, label: "回退次数" },
      ],
      notes: ["流程评价：当前链路连续性较好，适合作为完整流程测试的基础版本。"],
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
    },
    {
      theme: "errors",
      title: "4. 错误与容错性",
      icon: flowIcon("errors"),
      body: [
        "当前流程的主要风险点在于节点变多后，用户可能忽略其中某一条连接关系或误解某一步的执行对象。",
        "如果后续支持高亮关键步骤、重新排序或补充提示，容错体验会更好。",
      ],
      notes: ["建议在后续版本补足节点异常提示、步骤校验和跨页回退说明。"],
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

  const route = body?.payload?.route;
  const sections = route === "flow-test" ? buildFlowTestSections(body.payload) : buildPageTestSections(body.payload);
  return {
    sections,
  };
}

async function handleAiRequest(request, response) {
  try {
    const body = await readRequestBody(request);
    const remoteResult = await proxyToRemote(body);
    sendJson(response, 200, remoteResult || buildMockResponse(body));
  } catch (error) {
    const code = error.message === "invalid-json" ? 400 : error.message === "body-too-large" ? 413 : 500;
    sendJson(response, code, {
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
    sendJson(response, 200, {
      ok: true,
      port: PORT,
      remoteConfigured: Boolean(getRemoteConfig().endpoint),
      remoteModel: getRemoteConfig().model,
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
