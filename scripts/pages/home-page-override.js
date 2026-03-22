(function overrideHomePage(global) {
  const homeMarkup = `
    <section class="home-page home-page--minimal" aria-label="首页工作台">
      <section class="home-panel home-workbench home-workbench--minimal" aria-labelledby="new-test-title">
        <div class="home-workbench__header home-workbench__header--centered">
          <h2 id="new-test-title" class="home-workbench__title home-workbench__title--centered">新建用户测试</h2>
        </div>

        <div class="home-workbench__actions home-workbench__actions--horizontal">
          <button class="home-action-card" type="button" data-route="page-test" aria-label="进入页面测试">
            <span class="home-action-card__content">
              <strong class="home-action-card__title">页面测试</strong>
            </span>
          </button>

          <button class="home-action-card" type="button" data-route="flow-test" aria-label="进入流程测试">
            <span class="home-action-card__content">
              <strong class="home-action-card__title">流程测试</strong>
            </span>
          </button>
        </div>
      </section>
    </section>
  `;

  function syncHomeRouteState() {
    const route = global.location.hash.replace(/^#\/?/, "").trim() || "home";
    const normalizedRoute = route === "home" ? "home" : route;
    const appShell = document.querySelector(".app-shell");

    document.body.setAttribute("data-route", normalizedRoute);
    appShell?.setAttribute("data-route", normalizedRoute);
  }

  global.HomePage = {
    createHomePage() {
      return homeMarkup;
    },
  };

  syncHomeRouteState();
  global.addEventListener("hashchange", syncHomeRouteState);
})(window);
