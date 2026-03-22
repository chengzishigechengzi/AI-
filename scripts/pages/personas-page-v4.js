(function attachPersonasPageV4(global) {
  const STORAGE_KEY = "ai-usability-personas";
  const modalRoot = document.querySelector("#modal-root");

  let pendingDeleteId = null;
  let modalState = getDefaultModalState();
  let activeModal = null;

  function getDefaultModalState() {
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

  function clearModal() {
    activeModal = null;
    if (modalRoot) {
      modalRoot.replaceChildren();
    }
  }

  function focusModalField(field) {
    if (!activeModal) {
      return;
    }

    const target = field === "description" ? activeModal.descriptionInput : activeModal.roleInput;
    global.requestAnimationFrame(() => {
      target?.focus();
    });
  }

  function refreshPage() {
    global.AppRouter?.setHashRoute("personas");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function createDeleteBubble(personaId) {
    return `
      <div class="personas-directory__delete-bubble" role="alertdialog" aria-live="polite">
        <p class="personas-directory__delete-text">确认删除这个用户画像吗？</p>
        <div class="personas-directory__delete-actions">
          <button
            class="button personas-directory__delete-confirm"
            type="button"
            data-action="persona-delete-confirm-v4"
            data-persona-id="${personaId}"
          >
            确认删除
          </button>
          <button
            class="button button--subtle personas-directory__delete-cancel"
            type="button"
            data-action="persona-delete-cancel-v4"
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
        <td class="personas-directory__cell personas-directory__cell--role">${escapeHtml(persona.role)}</td>
        <td class="personas-directory__cell personas-directory__cell--description">${escapeHtml(persona.description)}</td>
        <td class="personas-directory__cell personas-directory__cell--actions">
          <div class="personas-directory__actions-wrap">
            <div class="personas-directory__actions">
              <button
                class="button button--subtle personas-directory__action-button"
                type="button"
                data-action="persona-edit-open-v4"
                data-persona-id="${persona.id}"
              >
                修改
              </button>
              <button
                class="button button--subtle personas-directory__action-button personas-directory__action-button--danger"
                type="button"
                data-action="persona-delete-request-v4"
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
          <button class="button button--primary personas-directory__empty-button" type="button" data-action="persona-create-open-v4">
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

  function createModalMarkup() {
    const title = modalState.mode === "edit" ? "编辑用户画像" : "新增用户画像";
    const submitLabel = modalState.mode === "edit" ? "确定保存" : "确定创建";

    return `
      <div class="persona-modal" role="dialog" aria-modal="true" aria-labelledby="persona-modal-title-v4">
        <button class="persona-modal__backdrop" type="button" aria-label="关闭弹窗"></button>
        <div class="persona-modal__dialog">
          <div class="persona-modal__header">
            <h2 id="persona-modal-title-v4" class="persona-modal__title">${title}</h2>
            <button class="persona-modal__close" type="button" aria-label="关闭弹窗">
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
                data-persona-modal-field-v4="role"
              >
              <span class="persona-modal__error${modalState.errors.role ? "" : " is-hidden"}" data-persona-modal-error-v4="role">${modalState.errors.role || ""}</span>
            </label>

            <label class="persona-modal__field persona-modal__field--textarea">
              <span class="persona-modal__label">用户详细特征</span>
              <textarea
                class="persona-modal__textarea"
                placeholder="请输入用户的年龄、背景、技术能力、性格、任务目标等详细信息"
                data-persona-modal-field-v4="description"
              >${escapeHtml(modalState.description)}</textarea>
              <span class="persona-modal__error${modalState.errors.description ? "" : " is-hidden"}" data-persona-modal-error-v4="description">${modalState.errors.description || ""}</span>
            </label>

            <span class="persona-modal__error persona-modal__error--submit${modalState.submitError ? "" : " is-hidden"}" data-persona-modal-error-v4="submit">${modalState.submitError || ""}</span>

            <button class="button button--primary persona-modal__submit" type="button">
              ${submitLabel}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function syncModalErrors() {
    if (!activeModal) {
      return;
    }

    const { roleError, descriptionError, submitError } = activeModal;

    roleError.textContent = modalState.errors.role || "";
    roleError.classList.toggle("is-hidden", !modalState.errors.role);

    descriptionError.textContent = modalState.errors.description || "";
    descriptionError.classList.toggle("is-hidden", !modalState.errors.description);

    submitError.textContent = modalState.submitError || "";
    submitError.classList.toggle("is-hidden", !modalState.submitError);
  }

  function attachModalEvents(modalElement) {
    const backdrop = modalElement.querySelector(".persona-modal__backdrop");
    const dialog = modalElement.querySelector(".persona-modal__dialog");
    const closeButton = modalElement.querySelector(".persona-modal__close");
    const submitButton = modalElement.querySelector(".persona-modal__submit");
    const roleInput = modalElement.querySelector('[data-persona-modal-field-v4="role"]');
    const descriptionInput = modalElement.querySelector('[data-persona-modal-field-v4="description"]');
    const roleError = modalElement.querySelector('[data-persona-modal-error-v4="role"]');
    const descriptionError = modalElement.querySelector('[data-persona-modal-error-v4="description"]');
    const submitError = modalElement.querySelector('[data-persona-modal-error-v4="submit"]');

    activeModal = {
      modalElement,
      roleInput,
      descriptionInput,
      roleError,
      descriptionError,
      submitError,
    };

    backdrop?.addEventListener("click", closeModal);
    closeButton?.addEventListener("click", closeModal);
    submitButton?.addEventListener("click", submitModal);

    dialog?.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });

    dialog?.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    roleInput?.addEventListener("input", (event) => {
      updateField("role", event.target.value);
      syncModalErrors();
    });

    descriptionInput?.addEventListener("input", (event) => {
      updateField("description", event.target.value);
      syncModalErrors();
    });
  }

  function renderModal(focusField) {
    if (!modalRoot) {
      return;
    }

    clearModal();

    if (!modalState.isOpen) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = createModalMarkup().trim();
    const modalElement = wrapper.firstElementChild;

    if (!modalElement) {
      return;
    }

    modalRoot.appendChild(modalElement);
    attachModalEvents(modalElement);
    syncModalErrors();
    focusModalField(focusField || "role");
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

          <button class="button button--primary personas-directory__create" type="button" data-action="persona-create-open-v4">
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
    modalState = getDefaultModalState();
    modalState.isOpen = true;
    pendingDeleteId = null;
    renderModal("role");
  }

  function openEditModal(id) {
    const current = readPersonas().find((persona) => persona.id === id);
    if (!current) {
      return;
    }

    modalState = {
      isOpen: true,
      mode: "edit",
      personaId: id,
      role: current.role,
      description: current.description,
      errors: {},
      submitError: "",
    };
    pendingDeleteId = null;
    renderModal("role");
  }

  function closeModal() {
    modalState = getDefaultModalState();
    clearModal();
  }

  function updateField(field, value) {
    modalState[field] = value;
    if (modalState.errors[field]) {
      delete modalState.errors[field];
    }
    if (modalState.submitError) {
      modalState.submitError = "";
    }
  }

  function validate() {
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
    const errors = validate();
    if (Object.keys(errors).length) {
      modalState.errors = errors;
      modalState.submitError = "";
      syncModalErrors();
      focusModalField(errors.role ? "role" : "description");
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

      closeModal();
      refreshPage();
    } catch (error) {
      modalState.submitError = "创建失败，请稍后重试";
      syncModalErrors();
      focusModalField("role");
    }
  }

  function requestDelete(id) {
    pendingDeleteId = pendingDeleteId === id ? null : id;
    refreshPage();
  }

  function cancelDelete() {
    pendingDeleteId = null;
    refreshPage();
  }

  function confirmDelete(id) {
    pendingDeleteId = null;
    writePersonas(readPersonas().filter((persona) => persona.id !== id));
    refreshPage();
  }

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    switch (actionTarget.dataset.action) {
      case "persona-create-open-v4":
        openCreateModal();
        return;
      case "persona-edit-open-v4":
        openEditModal(actionTarget.dataset.personaId);
        return;
      case "persona-delete-request-v4":
        requestDelete(actionTarget.dataset.personaId);
        return;
      case "persona-delete-cancel-v4":
        cancelDelete();
        return;
      case "persona-delete-confirm-v4":
        confirmDelete(actionTarget.dataset.personaId);
        return;
      default:
        break;
    }
  });

  global.PersonasPage = {
    createPersonasPage,
  };
})(window);
