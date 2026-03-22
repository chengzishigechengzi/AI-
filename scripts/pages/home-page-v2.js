(function overrideHomePageV2(global) {
  const homeMarkup = `
    <section class="minimal-home" aria-label="首页工作台">
      <section class="minimal-home__panel" aria-labelledby="new-test-title">
        <div class="minimal-home__header">
          <h2 id="new-test-title" class="minimal-home__title">新建用户测试</h2>
        </div>

        <div class="minimal-home__actions">
          <button class="minimal-home__card" type="button" data-route="page-test" aria-label="进入页面测试">
            <span class="minimal-home__card-content">
              <strong class="minimal-home__card-title">页面测试</strong>
            </span>
          </button>

          <button class="minimal-home__card" type="button" data-route="flow-test" aria-label="进入流程测试">
            <span class="minimal-home__card-content">
              <strong class="minimal-home__card-title">流程测试</strong>
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
