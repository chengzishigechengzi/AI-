(function attachAiClient(global) {
  const AI_API_ID = "d2adb12b-9767-4e88-b313-d19b48c8d272";
  const DEFAULT_REMOTE_CONFIG = {
    enabled: false,
    endpoint: "",
    fallbackEndpoints: [],
    apiKey: "",
    apiKeyHeader: "",
    authScheme: "Bearer",
    timeoutMs: 120000,
    headers: {},
  };

  function wait(duration) {
    return new Promise((resolve) => {
      global.setTimeout(resolve, duration);
    });
  }

  function mergeHeaders(baseHeaders, extraHeaders) {
    return {
      ...(baseHeaders || {}),
      ...(extraHeaders || {}),
    };
  }

  function getConfig() {
    const runtimeConfig = global.__APP_AI_CONFIG__ || {};
    return {
      apiId: AI_API_ID,
      ...DEFAULT_REMOTE_CONFIG,
      ...runtimeConfig,
      headers: mergeHeaders(DEFAULT_REMOTE_CONFIG.headers, runtimeConfig.headers),
    };
  }

  function getAuthHeaders(config) {
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

  function getEndpointCandidates(config) {
    const endpoints = [config.endpoint]
      .concat(Array.isArray(config.fallbackEndpoints) ? config.fallbackEndpoints : [])
      .filter(Boolean);

    return endpoints.filter((endpoint, index) => endpoints.indexOf(endpoint) === index);
  }

  function normalizeAnalyzeResponse(data) {
    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data?.sections)) {
      return data.sections;
    }

    if (Array.isArray(data?.data?.sections)) {
      return data.data.sections;
    }

    if (Array.isArray(data?.result?.sections)) {
      return data.result.sections;
    }

    throw new Error("ai-invalid-sections-response");
  }

  function normalizeFollowUpResponse(data) {
    if (typeof data === "string") {
      return data;
    }

    if (typeof data?.answer === "string") {
      return data.answer;
    }

    if (typeof data?.data?.answer === "string") {
      return data.data.answer;
    }

    if (typeof data?.result?.answer === "string") {
      return data.result.answer;
    }

    throw new Error("ai-invalid-answer-response");
  }

  async function requestRemoteOnce(endpoint, action, payload, config) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? global.setTimeout(() => {
          controller.abort();
        }, Number(config.timeoutMs) || DEFAULT_REMOTE_CONFIG.timeoutMs)
      : null;

    try {
      const response = await global.fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...config.headers,
          ...getAuthHeaders(config),
        },
        body: JSON.stringify({
          apiId: AI_API_ID,
          action,
          payload,
        }),
        signal: controller?.signal,
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || `ai-http-${response.status}`);
      }

      return data;
    } finally {
      if (timeoutId) {
        global.clearTimeout(timeoutId);
      }
    }
  }

  async function requestRemote(action, payload) {
    const config = getConfig();
    const endpoints = getEndpointCandidates(config);
    if (!config.enabled || !endpoints.length) {
      throw new Error("ai-endpoint-not-configured");
    }

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        return await requestRemoteOnce(endpoint, action, payload, config);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("ai-request-failed");
  }

  async function analyzePageTest(payload, options) {
    const config = getConfig();
    if (config.enabled && config.endpoint) {
      const data = await requestRemote("analyze", payload);
      return normalizeAnalyzeResponse(data);
    }

    await wait(1400);

    if (typeof options?.fallback === "function") {
      return options.fallback({
        apiId: AI_API_ID,
        payload,
      });
    }

    throw new Error("page-test-analysis-not-implemented");
  }

  async function followUpPageTest(payload, options) {
    const config = getConfig();
    if (config.enabled && config.endpoint) {
      const data = await requestRemote("followup", payload);
      return normalizeFollowUpResponse(data);
    }

    await wait(900);

    if (typeof options?.fallback === "function") {
      return options.fallback({
        apiId: AI_API_ID,
        payload,
      });
    }

    throw new Error("page-test-follow-up-not-implemented");
  }

  global.AppAI = {
    analyzePageTest,
    followUpPageTest,
    getConfig,
  };
})(window);
