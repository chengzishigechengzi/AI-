(function overrideHomePageV4(global) {
  const homeMarkup = `
    <section class="home-ref" aria-label="首页工作台">
      <section class="home-ref__top" aria-label="快捷入口">
        <button class="home-ref-shortcut" type="button" data-route="personas" aria-label="进入用户画像管理">
          <span class="home-ref-shortcut__icon" aria-hidden="true">
            <svg class="home-ref-shortcut__icon-svg home-ref-shortcut__icon-svg--personas" viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="8" r="3.25"></circle>
              <path d="M6.5 18.25c0-2.7 2.45-4.75 5.5-4.75s5.5 2.05 5.5 4.75"></path>
            </svg>
          </span>
          <span class="home-ref-shortcut__body">
            <strong class="home-ref-shortcut__title">用户画像管理</strong>
            <span class="home-ref-shortcut__text">管理测试用户的基本信息与特征</span>
          </span>
        </button>

        <button class="home-ref-shortcut" type="button" data-route="history" aria-label="进入历史记录">
          <span class="home-ref-shortcut__icon" aria-hidden="true">
            <svg class="home-ref-shortcut__icon-svg home-ref-shortcut__icon-svg--history" viewBox="0 0 24 24" focusable="false">
              <path d="M20 12a8 8 0 1 1-2.35-5.66"></path>
              <path d="M20 5v4h-4"></path>
              <path d="M12 8.5v4l2.75 1.75"></path>
            </svg>
          </span>
          <span class="home-ref-shortcut__body">
            <strong class="home-ref-shortcut__title">历史记录</strong>
            <span class="home-ref-shortcut__text">查看所有已保存的测试记录</span>
          </span>
        </button>
      </section>

      <section class="home-ref-main" aria-labelledby="home-ref-title">
        <div class="home-ref-main__decor home-ref-main__decor--lt" aria-hidden="true"></div>
        <div class="home-ref-main__decor home-ref-main__decor--rt" aria-hidden="true"></div>
        <div class="home-ref-main__decor home-ref-main__decor--lb" aria-hidden="true"></div>
        <div class="home-ref-main__decor home-ref-main__decor--rb" aria-hidden="true"></div>

        <div class="home-ref-main__header">
          <h2 id="home-ref-title" class="home-ref-main__title">新建可用性测试</h2>
          <p class="home-ref-main__subtitle">选择测试类型开始您的用户体验测试</p>
        </div>

        <div class="home-ref-main__actions">
          <button class="home-ref-test-card" type="button" data-route="page-test" aria-label="进入页面测试">
            <span class="home-ref-test-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"></path>
                <path d="M14 3v6h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
            </span>
            <span class="home-ref-test-card__body">
              <strong class="home-ref-test-card__title">页面测试</strong>
              <span class="home-ref-test-card__text">测试单个页面的用户体验</span>
            </span>
          </button>

          <button class="home-ref-test-card" type="button" data-route="flow-test" aria-label="进入流程测试">
            <span class="home-ref-test-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M6 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"></path>
                <path d="M18 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"></path>
                <path d="M12 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"></path>
                <path d="M8 8c2.4 0 3.4 1.5 4 3.5"></path>
                <path d="M16 8c-2.4 0-3.4 1.5-4 3.5"></path>
                <path d="M12 13v3"></path>
              </svg>
            </span>
            <span class="home-ref-test-card__body">
              <strong class="home-ref-test-card__title">流程测试</strong>
              <span class="home-ref-test-card__text">测试完整的业务流程体验</span>
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
