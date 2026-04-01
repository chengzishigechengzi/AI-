(function configureAiRuntime(global) {
        var locationInfo = global.location || {};
        var protocol = locationInfo.protocol || "";
        var hostname = locationInfo.hostname || "";
        var origin = locationInfo.origin || "";
        var isFilePreview = protocol === "file:";
        var isLocalPreview = hostname === "localhost" || hostname === "127.0.0.1";
        var localProxyEndpoint = "http://localhost:3000/api/ai";
        var sameOriginEndpoint = "/api/ai";

        var endpoint = sameOriginEndpoint;
        var fallbackEndpoints = [];

        if (isFilePreview) {
          endpoint = localProxyEndpoint;
        } else if (isLocalPreview) {
          endpoint = sameOriginEndpoint;
          if (origin && origin !== "http://localhost:3000" && origin !== "http://127.0.0.1:3000") {
            fallbackEndpoints.push(localProxyEndpoint);
          }
        }

        global.__APP_AI_CONFIG__ = Object.assign(
          {
            enabled: true,
            endpoint: endpoint,
            fallbackEndpoints: fallbackEndpoints,
            apiKey: "",
            apiKeyHeader: "",
            authScheme: "Bearer",
            timeoutMs: 240000,
            headers: {},
          },
          global.__APP_AI_CONFIG__ || {}
        );
      })(window);