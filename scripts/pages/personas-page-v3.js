(function attachPersonasPageV3(global) {
  const STORAGE_KEY = "ai-usability-personas";
  const modalRoot = document.querySelector("#modal-root");
  let pendingDeleteId = null;
  let modalState = createDefaultModalState();

  function createDefaultModalState() {
    return {
      isOpen: false,
      mode: "create",
      personaId: "",
      role: "",
      description: "",
      errors: {},
      submitError: "",
    };
  }

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

  function focusModalField(field) {
    global.setTimeout(() => {
      const selector =
        field === "description"
          ? '[data-persona-modal-field="description"]'
          : '[data-persona-modal-field="role"]';
      document.querySelector(selector)?.focus();
    }, 0);
  }

  function renderModalOverlay(focusField) {
    if (modalRoot) {
      modalRoot.innerHTML = createModal();
    }

    if (modalState.isOpen) {
      focusModalField(focusField || "role");
    }
  }

  function refreshPersonasPage(focusField) {
    global.AppRouter?.setHashRoute("personas");
    renderModalOverlay(focusField);
  }

  function buildDeleteBubble(personaId) {
    return `
      <div class="personas-directory__delete-bubble" role="alertdialog" aria-live="polite">
        <p class="personas-directory__delete-text">确认删除这个用户画像吗？</p>
        <div class="personas-directory__delete-actions">
          <button
            class="button personas-directory__delete-confirm"
            type="button"
            data-action="persona-delete-confirm-v3"
            data-persona-id="${personaId}"
          >
            确认删除
          </button>
          <button
            class="button button--subtle personas-directory__delete-cancel"
            type="button"
            data-action="persona-delete-cancel-v3"
          >
            取消
          </button>
        </div>
      </div>
    `;
  }

  function buildPersonaRow(persona, index) {
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
                data-action="persona-edit-open-v3"
                data-persona-id="${persona.id}"
              >
                修改
              </button>
              <button
                class="button button--subtle personas-directory__action-button personas-directory__action-button--danger"
                type="button"
                data-action="persona-delete-request-v3"
                data-persona-id="${persona.id}"
              >
                删除
              </button>
            </div>
            ${isDeletePending ? buildDeleteBubble(persona.id) : ""}
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
          <button class="button button--primary personas-directory__empty-button" type="button" data-action="persona-create-open-v3">
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
            ${personas.map(buildPersonaRow).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function createModal() {
    if (!modalState.isOpen) {
      return "";
    }

    const title = modalState.mode === "edit" ? "编辑用户画像" : "新增用户画像";
    const submitLabel = modalState.mode === "edit" ? "确定保存" : "确定创建";
    const roleError = modalState.errors.role || "";
    const descriptionError = modalState.errors.description || "";
    const submitError = modalState.submitError || "";

    return `
      <div class="persona-modal" role="dialog" aria-modal="true" aria-labelledby="persona-modal-title">
        <button class="persona-modal__backdrop" type="button" data-action="persona-modal-close-v3" aria-label="关闭弹窗"></button>
        <div class="persona-modal__dialog">
          <div class="persona-modal__header">
            <h2 id="persona-modal-title" class="persona-modal__title">${title}</h2>
            <button class="persona-modal__close" type="button" data-action="persona-modal-close-v3" aria-label="关闭弹窗">
              <span class="persona-modal__close-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M6 6l12 12"></path>
                  <path d="M18 6L6 18"></path>
                </svg>
              </span>
            </button>
          </div>

          <div class="persona-modal__form">
            <label class="persona-modal__field">
              <span class="persona-modal__label">用户类型</span>
              <input
                class="persona-modal__input"
                type="text"
                maxlength="20"
                placeholder="请输入用户类型"
                value="${escapeHtml(modalState.role)}"
                data-persona-modal-field="role"
              >
              <span class="persona-modal__error${roleError ? "" : " is-hidden"}" data-persona-modal-error="role">${roleError}</span>
            </label>

            <label class="persona-modal__field persona-modal__field--textarea">
              <span class="persona-modal__label">用户详细特征</span>
              <textarea
                class="persona-modal__textarea"
                placeholder="请输入用户的年龄、背景、技术能力、性格、任务目标等详细信息"
                data-persona-modal-field="description"
              >${escapeHtml(modalState.description)}</textarea>
              <span class="persona-modal__error${descriptionError ? "" : " is-hidden"}" data-persona-modal-error="description">${descriptionError}</span>
            </label>

            <span class="persona-modal__error persona-modal__error--submit${submitError ? "" : " is-hidden"}" data-persona-modal-error="submit">${submitError}</span>

            <button class="button button--primary persona-modal__submit" type="button" data-action="persona-modal-submit-v3">
              ${submitLabel}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function createPersonasPage() {
    const personas = readPersonas();

    return `
      <section class="personas-directory personas-directory--v2 personas-directory--v3" aria-labelledby="personas-page-title">
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

          <button class="button button--primary personas-directory__create" type="button" data-action="persona-create-open-v3">
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

  function openCreateModal() {
    modalState = createDefaultModalState();
    modalState.isOpen = true;
    modalState.mode = "create";
    pendingDeleteId = null;
    renderModalOverlay("role");
  }

  function openEditModal(id) {
    const current = readPersonas().find((persona) => persona.id === id);
    if (!current) {
      return;
    }

    modalState = createDefaultModalState();
    modalState.isOpen = true;
    modalState.mode = "edit";
    modalState.personaId = id;
    modalState.role = current.role;
    modalState.description = current.description;
    pendingDeleteId = null;
    renderModalOverlay("role");
  }

  function closeModal() {
    modalState = createDefaultModalState();
    renderModalOverlay();
  }

  function setModalField(field, value) {
    modalState[field] = value;
    if (modalState.errors[field]) {
      delete modalState.errors[field];
      const errorNode = document.querySelector(`[data-persona-modal-error="${field}"]`);
      if (errorNode) {
        errorNode.textContent = "";
        errorNode.classList.add("is-hidden");
      }
    }

    if (modalState.submitError) {
      modalState.submitError = "";
      const submitErrorNode = document.querySelector('[data-persona-modal-error="submit"]');
      if (submitErrorNode) {
        submitErrorNode.textContent = "";
        submitErrorNode.classList.add("is-hidden");
      }
    }
  }

  function validateModal() {
    const errors = {};
    const role = modalState.role.trim();
    const description = modalState.description.trim();

    if (!role) {
      errors.role = "请输入用户类型";
    } else if (role.length > 20) {
      errors.role = "用户类型不能超过20个字符";
    } else if (!/^[\u4e00-\u9fa5A-Za-z0-9\s_-]+$/.test(role)) {
      errors.role = "用户类型不能包含特殊字符";
    }

    if (!description) {
      errors.description = "请输入用户详细特征";
    }

    return errors;
  }

  function submitModal() {
    const errors = validateModal();
    if (Object.keys(errors).length) {
      modalState.errors = errors;
      renderModalOverlay(errors.role ? "role" : "description");
      return;
    }

    try {
      const personas = readPersonas();

      if (modalState.mode === "edit") {
        writePersonas(
          personas.map((persona) =>
            persona.id === modalState.personaId
              ? {
                  ...persona,
                  role: modalState.role.trim(),
                  description: modalState.description.trim(),
                }
              : persona,
          ),
        );
      } else {
        personas.push({
          id: Date.now().toString(36),
          role: modalState.role.trim(),
          description: modalState.description.trim(),
        });
        writePersonas(personas);
      }

      pendingDeleteId = null;
      modalState = createDefaultModalState();
      renderModalOverlay();
      refreshPersonasPage();
    } catch (error) {
      modalState.submitError = "创建失败，请稍后重试";
      renderModalOverlay("role");
    }
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
    pendingDeleteId = null;
    writePersonas(personas.filter((persona) => persona.id !== id));
    refreshPersonasPage();
  }

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    if (actionTarget.dataset.action === "persona-create-open-v3") {
      openCreateModal();
      return;
    }

    if (actionTarget.dataset.action === "persona-edit-open-v3") {
      openEditModal(actionTarget.dataset.personaId);
      return;
    }

    if (actionTarget.dataset.action === "persona-modal-close-v3") {
      closeModal();
      return;
    }

    if (actionTarget.dataset.action === "persona-modal-submit-v3") {
      submitModal();
      return;
    }

    if (actionTarget.dataset.action === "persona-delete-request-v3") {
      requestDeletePersona(actionTarget.dataset.personaId);
      return;
    }

    if (actionTarget.dataset.action === "persona-delete-cancel-v3") {
      cancelDeletePersona();
      return;
    }

    if (actionTarget.dataset.action === "persona-delete-confirm-v3") {
      deletePersona(actionTarget.dataset.personaId);
    }
  });

  document.addEventListener("input", (event) => {
    const field = event.target.dataset.personaModalField;
    if (!field) {
      return;
    }

    setModalField(field, event.target.value);
  });

  global.PersonasPage = {
    createPersonasPage,
  };
})(window);
