(function attachPersonasPageV2(global) {
  const STORAGE_KEY = "ai-usability-personas";
  let pendingDeleteId = null;

  function readPersonas() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writePersonas(personas) {
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(personas));
  }

  function refreshPersonasPage() {
    global.AppRouter?.setHashRoute("personas");
  }

  function createDeleteBubble(personaId) {
    return `
      <div class="personas-directory__delete-bubble" role="alertdialog" aria-live="polite">
        <p class="personas-directory__delete-text">确认删除这个用户画像吗？</p>
        <div class="personas-directory__delete-actions">
          <button
            class="button personas-directory__delete-confirm"
            type="button"
            data-action="persona-delete-confirm"
            data-persona-id="${personaId}"
          >
            确认删除
          </button>
          <button
            class="button button--subtle personas-directory__delete-cancel"
            type="button"
            data-action="persona-delete-cancel"
          >
            取消
          </button>
        </div>
      </div>
    `;
  }

  function createRow(persona, index) {
    const isDeletePending = pendingDeleteId === persona.id;

    return `
      <tr class="personas-directory__row">
        <td class="personas-directory__cell personas-directory__cell--index">${index + 1}</td>
        <td class="personas-directory__cell personas-directory__cell--role">${persona.role}</td>
        <td class="personas-directory__cell personas-directory__cell--description">${persona.description}</td>
        <td class="personas-directory__cell personas-directory__cell--actions">
          <div class="personas-directory__actions-wrap">
            <div class="personas-directory__actions">
              <button
                class="button button--subtle personas-directory__action-button"
                type="button"
                data-action="persona-edit"
                data-persona-id="${persona.id}"
              >
                修改
              </button>
              <button
                class="button button--subtle personas-directory__action-button personas-directory__action-button--danger"
                type="button"
                data-action="persona-delete-request"
                data-persona-id="${persona.id}"
              >
                删除
              </button>
            </div>
            ${isDeletePending ? createDeleteBubble(persona.id) : ""}
          </div>
        </td>
      </tr>
    `;
  }

  function createEmptyState() {
    return `
      <div class="personas-directory__empty">
        <div class="personas-directory__empty-content">
          <h2 class="personas-directory__empty-title">还没有用户画像</h2>
          <p class="personas-directory__empty-text">点击右上角“新建用户画像”，开始添加测试用户类型。</p>
          <button class="button button--primary personas-directory__empty-button" type="button" data-action="persona-create">
            新建用户画像
          </button>
        </div>
      </div>
    `;
  }

  function createTable(personas) {
    return `
      <div class="personas-directory__table-card">
        <table class="personas-directory__table">
          <thead>
            <tr class="personas-directory__head-row">
              <th class="personas-directory__head personas-directory__head--index">序号</th>
              <th class="personas-directory__head personas-directory__head--role">用户类型</th>
              <th class="personas-directory__head personas-directory__head--description">用户详细描述</th>
              <th class="personas-directory__head personas-directory__head--actions">操作</th>
            </tr>
          </thead>
          <tbody>
            ${personas.map(createRow).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function createPersonasPage() {
    const personas = readPersonas();

    return `
      <section class="personas-directory personas-directory--v2" aria-labelledby="personas-page-title">
        <div class="personas-directory__topbar personas-directory__topbar--v2">
          <button class="button button--subtle personas-directory__back personas-directory__back--compact" type="button" data-route="home" aria-label="返回首页">
            <span class="personas-directory__back-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M15 18l-6-6 6-6"></path>
              </svg>
            </span>
            <span>返回首页</span>
          </button>
        </div>

        <div class="personas-directory__header personas-directory__header--tight">
          <div class="personas-directory__title-group">
            <h1 id="personas-page-title" class="personas-directory__title">用户画像</h1>
            <p class="personas-directory__subtitle">统一管理测试用户类型，快速选择适合的可用性测试对象。</p>
          </div>

          <button class="button button--primary personas-directory__create" type="button" data-action="persona-create">
            <span class="personas-directory__create-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 5v14"></path>
                <path d="M5 12h14"></path>
              </svg>
            </span>
            <span>新建用户画像</span>
          </button>
        </div>

        ${personas.length ? createTable(personas) : createEmptyState()}
      </section>
    `;
  }

  function createPersona() {
    const role = global.prompt("请输入用户类型名称，例如：产品经理");
    if (!role || !role.trim()) {
      return;
    }

    const description = global.prompt("请输入用户详细描述");
    if (!description || !description.trim()) {
      return;
    }

    const personas = readPersonas();
    personas.push({
      id: Date.now().toString(36),
      role: role.trim(),
      description: description.trim(),
    });
    pendingDeleteId = null;
    writePersonas(personas);
    refreshPersonasPage();
  }

  function editPersona(id) {
    const personas = readPersonas();
    const current = personas.find((persona) => persona.id === id);
    if (!current) {
      return;
    }

    const role = global.prompt("修改用户类型名称", current.role);
    if (!role || !role.trim()) {
      return;
    }

    const description = global.prompt("修改用户详细描述", current.description);
    if (!description || !description.trim()) {
      return;
    }

    writePersonas(
      personas.map((persona) =>
        persona.id === id
          ? {
              ...persona,
              role: role.trim(),
              description: description.trim(),
            }
          : persona,
      ),
    );
    pendingDeleteId = null;
    refreshPersonasPage();
  }

  function requestDeletePersona(id) {
    pendingDeleteId = pendingDeleteId === id ? null : id;
    refreshPersonasPage();
  }

  function cancelDeletePersona() {
    pendingDeleteId = null;
    refreshPersonasPage();
  }

  function deletePersona(id) {
    const personas = readPersonas();
    if (!personas.find((persona) => persona.id === id)) {
      return;
    }

    pendingDeleteId = null;
    writePersonas(personas.filter((persona) => persona.id !== id));
    refreshPersonasPage();
  }

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    if (actionTarget.dataset.action === "persona-create") {
      createPersona();
      return;
    }

    if (actionTarget.dataset.action === "persona-edit") {
      editPersona(actionTarget.dataset.personaId);
      return;
    }

    if (actionTarget.dataset.action === "persona-delete-request") {
      requestDeletePersona(actionTarget.dataset.personaId);
      return;
    }

    if (actionTarget.dataset.action === "persona-delete-cancel") {
      cancelDeletePersona();
      return;
    }

    if (actionTarget.dataset.action === "persona-delete-confirm") {
      deletePersona(actionTarget.dataset.personaId);
    }
  });

  global.PersonasPage = {
    createPersonasPage,
  };
})(window);
