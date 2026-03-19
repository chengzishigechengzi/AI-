(function attachHomePage(global) {
  function createHomePage() {
    return `
      <section class="home-page" aria-label="首页工作台">
        <div class="home-page__top">
          <button class="home-entry-card" type="button" data-route="personas" aria-label="进入用户画像管理">
            <div class="home-entry-card__content">
              <h2 class="home-entry-card__title">用户画像管理</h2>
            </div>
          </button>

          <button class="home-entry-card" type="button" data-route="history" aria-label="进入历史记录管理">
            <div class="home-entry-card__content">
              <h2 class="home-entry-card__title">历史记录管理</h2>
            </div>
          </button>
        </div>

        <div class="home-page__bottom">
          <section class="home-panel home-workbench" aria-labelledby="new-test-title">
            <div class="home-workbench__header">
              <h2 id="new-test-title" class="home-workbench__title">新建用户测试</h2>
            </div>

            <div class="home-workbench__actions">
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
        </div>
      </section>
    `;
  }

  global.HomePage = {
    createHomePage,
  };
})(window);
