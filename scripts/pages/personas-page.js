(function attachPersonasPage(global) {
  const PERSONAS = [
    {
      id: 1,
      role: "产品经理",
      description:
        "35岁，互联网行业从业8年，技术熟练度中等，性格外向善于沟通，主要任务目标为产品规划与需求分析。",
    },
    {
      id: 2,
      role: "开发工程师",
      description:
        "28岁，计算机专业背景，技术熟练度高，性格严谨注重细节，主要任务目标为代码开发与技术攻关。",
    },
    {
      id: 3,
      role: "设计师",
      description:
        "30岁，设计专业毕业，技术熟练度中上，性格感性富有创意，主要任务目标为界面设计与用户体验优化。",
    },
  ];

  function createRows() {
    return PERSONAS.map(
      (persona) => `
        <tr class="personas-directory__row">
          <td class="personas-directory__cell personas-directory__cell--index">${persona.id}</td>
          <td class="personas-directory__cell personas-directory__cell--role">${persona.role}</td>
          <td class="personas-directory__cell personas-directory__cell--description">${persona.description}</td>
        </tr>
      `,
    ).join("");
  }

  function createPersonasPage() {
    return `
      <section class="personas-directory" aria-labelledby="personas-page-title">
        <div class="personas-directory__topbar">
          <button class="button button--subtle personas-directory__back" type="button" data-route="home" aria-label="返回首页">
            <span class="personas-directory__back-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M15 18l-6-6 6-6"></path>
              </svg>
            </span>
            <span>返回首页</span>
          </button>
        </div>

        <div class="personas-directory__header">
          <div class="personas-directory__title-group">
            <h1 id="personas-page-title" class="personas-directory__title">用户画像</h1>
            <p class="personas-directory__subtitle">统一管理测试用户类型，快速选择适合的可用性测试对象。</p>
          </div>

          <button class="button button--primary personas-directory__create" type="button" data-action="create-persona">
            <span class="personas-directory__create-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 5v14"></path>
                <path d="M5 12h14"></path>
              </svg>
            </span>
            <span>新建用户画像</span>
          </button>
        </div>

        <div class="personas-directory__table-card">
          <table class="personas-directory__table">
            <thead>
              <tr class="personas-directory__head-row">
                <th class="personas-directory__head personas-directory__head--index">序号</th>
                <th class="personas-directory__head personas-directory__head--role">用户类型</th>
                <th class="personas-directory__head personas-directory__head--description">用户详细描述</th>
              </tr>
            </thead>
            <tbody>
              ${createRows()}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  global.PersonasPage = {
    createPersonasPage,
  };
})(window);
