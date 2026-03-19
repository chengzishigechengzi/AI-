(function startApp(global) {
  const { createHomePage } = global.HomePage;
  const { getRouteMeta, parseHashRoute, setHashRoute } = global.AppRouter;

  const appView = document.querySelector("#app-view");
  const pageTitle = document.querySelector("#page-title");
  const pageSubtitle = document.querySelector("#page-subtitle");
  const navItems = Array.from(document.querySelectorAll(".sidebar-nav__item"));
  const toastRoot = document.querySelector("#toast-root");
  const createTestButton = document.querySelector('[data-action="create-test"]');
  const quickActionButton = document.querySelector('[data-action="open-command-palette"]');
  const globalSearch = document.querySelector("#global-search");

  const placeholderConfig = {
    "page-test": {
      label: "页面测试",
      eyebrow: "Single Screen Test",
      description: "页面测试工作区已准备好，下一步可以接入上传设计图、任务目标输入与 AI 结果面板。",
      actionText: "从首页返回",
      actionRoute: "home",
    },
    "flow-test": {
      label: "流程测试",
      eyebrow: "Multi Step Flow",
      description: "流程测试工作区已准备好，下一步可以接入多页面上传、连线配置与流程说明编辑。",
      actionText: "从首页返回",
      actionRoute: "home",
    },
    history: {
      label: "历史记录",
      eyebrow: "Saved Reports",
      description: "历史记录模块已准备好，下一步可以接入测试归档列表、详情查看、追问和重新生成。",
      actionText: "返回首页",
      actionRoute: "home",
    },
    personas: {
      label: "用户画像",
      eyebrow: "Persona Management",
      description: "用户画像模块已准备好，下一步可以接入画像卡片、创建编辑弹窗与删除确认流程。",
      actionText: "返回首页",
      actionRoute: "home",
    },
  };

  function createPlaceholderPage(route) {
    const config = placeholderConfig[route];

    return `
      <section class="feature-page">
        <div class="card">
          <div class="card__header">
            <div>
              <p class="home-entry-card__eyebrow">${config.eyebrow}</p>
              <h2 class="card__title">${config.label}</h2>
            </div>
            <span class="status-pill">即将接入</span>
          </div>
          <p class="card__meta">${config.description}</p>
          <div class="inline-actions" style="margin-top: 1.5rem;">
            <button class="button button--primary" type="button" data-route="${config.actionRoute}">
              ${config.actionText}
            </button>
          </div>
        </div>
      </section>
    `;
  }

  function updateHeader(route) {
    const meta = getRouteMeta(route);
    pageTitle.textContent = meta.title;
    pageSubtitle.textContent = meta.subtitle;
  }

  function updateSidebar(route) {
    navItems.forEach((item) => {
      const isActive = item.dataset.route === route;
      item.classList.toggle("is-active", isActive);

      if (isActive) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }

  function renderRoute(route) {
    appView.dataset.view = route;
    updateHeader(route);
    updateSidebar(route);

    if (route === "home") {
      appView.innerHTML = createHomePage();
    } else {
      appView.innerHTML = createPlaceholderPage(route);
    }

    appView.focus();
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "status-pill";
    toast.textContent = message;
    toast.style.position = "absolute";
    toast.style.right = "1.25rem";
    toast.style.bottom = "1.25rem";
    toast.style.pointerEvents = "auto";
    toast.style.padding = "0.7rem 0.95rem";
    toast.style.boxShadow = "var(--shadow-sm)";

    toastRoot.replaceChildren(toast);

    global.clearTimeout(showToast.timer);
    showToast.timer = global.setTimeout(() => {
      toast.remove();
    }, 2200);
  }

  function handleRouteTrigger(target) {
    const routeTarget = target.closest("[data-route]");
    if (!routeTarget) {
      return false;
    }

    setHashRoute(routeTarget.dataset.route);
    return true;
  }

  document.addEventListener("click", (event) => {
    if (handleRouteTrigger(event.target)) {
      return;
    }

    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    if (actionTarget === createTestButton) {
      setHashRoute("page-test");
      return;
    }

    if (actionTarget === quickActionButton) {
      showToast("快捷操作面板将在后续步骤接入。");
    }
  });

  globalSearch?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (globalSearch.value.trim()) {
      showToast(`搜索能力将在后续步骤接入：${globalSearch.value.trim()}`);
    }
  });

  global.addEventListener("hashchange", () => {
    renderRoute(parseHashRoute());
  });

  renderRoute(parseHashRoute());
})(window);
