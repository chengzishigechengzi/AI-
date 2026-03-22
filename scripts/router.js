(function attachRouter(global) {
  const ROUTES = {
    home: {
      title: "首页",
      subtitle: "管理用户画像、浏览历史记录，并从这里发起新的页面或流程测试。",
    },
    "page-test": {
      title: "页面测试",
      subtitle: "上传单张页面设计图，选择用户画像并生成 AI 仿真体验分析。",
    },
    "flow-test": {
      title: "流程测试",
      subtitle: "上传多张流程页面并建立跳转关系，模拟真实用户完成完整任务流程。",
    },
    "flow-test-next": {
      title: "流程测试",
      subtitle: "继续补充后续流程测试配置，进入下一步分析或结果确认环节。",
    },
    history: {
      title: "历史记录",
      subtitle: "查看保存过的测试结果、复盘问题结论，并继续追问或重新生成。",
    },
    personas: {
      title: "用户画像",
      subtitle: "集中管理测试用的用户画像，支持查看、创建和维护关键行为特征。",
    },
  };

  function normalizeRoute(route) {
    if (!route) {
      return "home";
    }

    return Object.hasOwn(ROUTES, route) ? route : "home";
  }

  function parseHashRoute() {
    const hash = global.location.hash.replace(/^#\/?/, "").trim();
    return normalizeRoute(hash || "home");
  }

  function setHashRoute(route) {
    const normalized = normalizeRoute(route);
    const nextHash = normalized === "home" ? "#/" : `#/${normalized}`;

    if (global.location.hash !== nextHash) {
      global.location.hash = nextHash;
      return;
    }

    global.dispatchEvent(new Event("hashchange"));
  }

  function getRouteMeta(route) {
    return ROUTES[normalizeRoute(route)];
  }

  global.AppRouter = {
    ROUTES,
    getRouteMeta,
    normalizeRoute,
    parseHashRoute,
    setHashRoute,
  };
})(window);
