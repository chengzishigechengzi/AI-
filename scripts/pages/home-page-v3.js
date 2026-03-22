(function overrideHomePageV3(global) {
  const homeMarkup = `
    <section class="home-dashboard" aria-label="首页工作台">
      <section class="home-dashboard__shortcuts" aria-label="快捷入口">
        <button class="home-shortcut-card" type="button" data-route="personas" aria-label="进入用户画像">
          <span class="home-shortcut-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"></path>
              <path d="M12 14c-3.33 0-6 1.79-6 4v1h12v-1c0-2.21-2.67-4-6-4Z"></path>
            </svg>
          </span>
          <span class="home-shortcut-card__label">用户画像</span>
        </button>

        <button class="home-shortcut-card" type="button" data-route="history" aria-label="进入历史记录">
          <span class="home-shortcut-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M13 3a9 9 0 1 0 8.95 10h-2.02A7 7 0 1 1 13 5v3l5-4-5-4Z"></path>
              <path d="M12 8h2v5H9v-2h3Z"></path>
            </svg>
          </span>
          <span class="home-shortcut-card__label">历史记录</span>
        </button>
      </section>

      <section class="home-workflow-panel" aria-labelledby="new-workflow-title">
        <div class="home-workflow-panel__header">
          <h2 id="new-workflow-title" class="home-workflow-panel__title">新建可用性测试</h2>
        </div>

        <div class="home-workflow-panel__actions">
          <button class="home-workflow-card" type="button" data-route="page-test" aria-label="进入页面测试">
            <span class="home-workflow-card__content">
              <strong class="home-workflow-card__title">页面测试</strong>
            </span>
          </button>

          <button class="home-workflow-card" type="button" data-route="flow-test" aria-label="进入流程测试">
            <span class="home-workflow-card__content">
              <strong class="home-workflow-card__title">流程测试</strong>
            </span>
          </button>
        </div>
      </section>
    </section>
  `;

  function syncHomeRouteState() {
    const route = global.location.hash.replace(/^#\/?/, "").trim() || "home";
    const appShell = document.querySelector(".app-shell");

    document.body.setAttribute("data-route", route);
    appShell?.setAttribute("data-route", route);
  }

  global.HomePage = {
    createHomePage() {
      return homeMarkup;
    },
  };

  syncHomeRouteState();
  global.addEventListener("hashchange", syncHomeRouteState);
})(window);
