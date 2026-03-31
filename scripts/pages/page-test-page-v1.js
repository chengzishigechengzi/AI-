(function attachPageTestPage(global) {
  const PERSONAS_STORAGE_KEY = "ai-usability-personas";
  const HISTORY_STORAGE_KEY = "ai-usability-history-records";
  const HISTORY_VIEW_STORAGE_KEY = "ai-usability-history-view-record";
  const modalRoot = document.querySelector("#modal-root");
  const toastRoot = document.querySelector("#toast-root");

  const state = createDefaultState();
  const modalStack = [];
  let pageRoot = null;
  let fileInput = null;
  let generateTimer = null;
  let followUpTimer = null;
  let generationRequestId = 0;
  let followUpRequestId = 0;
  let isTaskComposing = false;
  let isFollowUpComposing = false;
  let followUpFocusGuardUntil = 0;

  function createDefaultState() {
    return {
      image: null,
      selectedPersonaId: "",
      taskDescription: "",
      isGenerateButtonPressed: false,
      isDragging: false,
      isGenerating: false,
      hasGenerated: false,
      resultSections: [],
      followUps: [],
      followUpQuestion: "",
      isFollowUpLoading: false,
      isSaved: false,
      generatedContext: null,
      resultError: "",
      historyViewPersonaName: "",
    };
  }

  function readPersonas() {
    try {
      const raw = global.localStorage.getItem(PERSONAS_STORAGE_KEY);
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
    global.localStorage.setItem(PERSONAS_STORAGE_KEY, JSON.stringify(personas));
  }

  function readHistoryRecords() {
    try {
      const raw = global.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeHistoryRecords(records) {
    global.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records));
  }

  function consumePendingHistoryView(route) {
    try {
      const raw =
        global.sessionStorage?.getItem(HISTORY_VIEW_STORAGE_KEY) ||
        global.localStorage?.getItem(HISTORY_VIEW_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || parsed.route !== route || !parsed.recordId) {
        return null;
      }

      global.sessionStorage?.removeItem(HISTORY_VIEW_STORAGE_KEY);
      global.localStorage?.removeItem(HISTORY_VIEW_STORAGE_KEY);
      return readHistoryRecords().find((record) => record.id === parsed.recordId) || null;
    } catch (error) {
      return null;
    }
  }

  function findMatchingPersonaId(record) {
    const personas = readPersonas();
    if (record?.personaId && personas.some((persona) => persona.id === record.personaId)) {
      return record.personaId;
    }

    const match = personas.find((persona) => persona.role === record?.userType);
    return match?.id || "";
  }

  function hydrateStateFromHistoryRecord(record) {
    if (!record || record.testType !== "page-test") {
      return;
    }

    Object.assign(state, createDefaultState(), {
      selectedPersonaId: findMatchingPersonaId(record),
      taskDescription: String(record.taskDescription || ""),
      hasGenerated: true,
      isSaved: true,
      resultSections: Array.isArray(record.resultSections) ? record.resultSections : [],
      followUps: Array.isArray(record.followUps) ? record.followUps : [],
      generatedContext: {
        imageName: record.screenshot ? "历史记录截图" : "",
        imageDataUrl: record.screenshot || "",
        personaId: record.personaId || findMatchingPersonaId(record),
        personaName: record.userType || "",
        taskDescription: String(record.taskDescription || ""),
        aiApiId: global.AppAI?.getConfig?.().apiId || "",
      },
      historyViewPersonaName: record.userType || "",
      image: record.screenshot
        ? {
            name: "历史记录截图",
            type: "image/png",
            dataUrl: record.screenshot,
            width: 0,
            height: 0,
          }
        : null,
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getSelectedPersona() {
    return readPersonas().find((persona) => persona.id === state.selectedPersonaId) || null;
  }

  function hasRequiredFields() {
    return Boolean(state.image && state.selectedPersonaId && state.taskDescription.trim());
  }

  function getMissingRequiredActions() {
    const missing = [];

    if (!state.image) {
      missing.push("上传页面截图");
    }

    if (!state.selectedPersonaId) {
      missing.push("选择用户画像");
    }

    if (!state.taskDescription.trim()) {
      missing.push("填写任务描述");
    }

    return missing;
  }

  function hasUnsavedGeneratedResult() {
    return state.hasGenerated && !state.isSaved;
  }

  function resolveAiErrorMessage(error) {
    const rawMessage = String(error?.message || "").trim();
    if (!rawMessage) {
      return "AI未连接成功";
    }

    if (rawMessage === "body-too-large" || /Request body too large/i.test(rawMessage)) {
      return "上传图片过大，请压缩后重试";
    }

    if (rawMessage === "ai-endpoint-not-configured") {
      return "AI接口未配置";
    }

    if (/Failed to fetch|NetworkError|fetch failed/i.test(rawMessage)) {
      return "AI代理请求失败，请检查本地服务或线上部署状态";
    }

    if (/timeout|aborted/i.test(rawMessage)) {
      return "AI响应超时，请稍后重试";
    }

    if (/remote-http-|Invalid JSON body|AI server error/i.test(rawMessage)) {
      return "AI服务返回异常，请稍后重试";
    }

    return rawMessage;
  }

  function createPageTestPage() {
    return `
      <section class="page-test-workspace" data-page-test-root>
        <div class="page-test-workspace__body">
          <section class="page-test-upload" aria-labelledby="page-test-upload-title">
            <h2 id="page-test-upload-title" class="sr-only">页面截图上传</h2>
            <div class="page-test-upload__frame" data-page-test-dropzone tabindex="0" role="button" aria-label="上传页面截图"></div>
            <input class="page-test-upload__input" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" data-page-test-file-input hidden>
          </section>

          <section class="page-test-side">
            <div class="page-test-toolbar">
              <div class="page-test-field page-test-field--persona">
                <label class="page-test-field__label">用户画像</label>
                <button class="page-test-persona-picker" type="button" data-action="page-test-open-persona-modal"></button>
              </div>

              <div class="page-test-field page-test-field--task">
                <span class="page-test-field__label">任务描述</span>
                <div
                  class="page-test-task-input"
                  contenteditable="true"
                  role="textbox"
                  aria-multiline="true"
                  data-placeholder="请描述用户需要完成的任务目标（如：完成登录操作、找到下单按钮等）..."
                  data-page-test-task-input
                ></div>
              </div>

              <div class="page-test-field page-test-field--generate">
                <span class="page-test-field__label page-test-field__label--ghost">开始生成</span>
                <button class="page-test-generate-button" type="button" data-action="page-test-generate"></button>
              </div>
            </div>

            <section class="page-test-results" aria-labelledby="page-test-results-title">
              <div class="page-test-results__header">
                <h2 id="page-test-results-title" class="page-test-results__title">生成结果</h2>
                <button class="page-test-results__regenerate" type="button" data-action="page-test-regenerate"></button>
              </div>

              <div class="page-test-results__content" data-page-test-results-content></div>
            </section>
          </section>
        </div>

        <div class="page-test-bottom-bar">
          <div class="page-test-bottom-bar__inner">
            <div class="page-test-bottom-bar__actions">
              <button class="button button--subtle page-test-bottom-bar__button page-test-bottom-bar__button--back" type="button" data-action="page-test-back-home">
                返回
              </button>
              <button class="button button--primary page-test-bottom-bar__button page-test-bottom-bar__button--save" type="button" data-action="page-test-save-result">
                保存结果
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function mountPageTestPage() {
    pageRoot = document.querySelector("[data-page-test-root]");
    if (!pageRoot) {
      return;
    }

    fileInput = pageRoot.querySelector("[data-page-test-file-input]");
    const historyRecord = consumePendingHistoryView("page-test");
    if (historyRecord) {
      hydrateStateFromHistoryRecord(historyRecord);
    }
    bindPageEvents();
    renderPage();
  }

  function focusTaskInputAtEnd(target) {
    if (!target) {
      return;
    }

    global.requestAnimationFrame(() => {
      target.focus();

      const selection = global.getSelection?.();
      if (!selection) {
        return;
      }

      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }

  function bindPageEvents() {
    const dropzone = pageRoot.querySelector("[data-page-test-dropzone]");
    const taskInput = pageRoot.querySelector("[data-page-test-task-input]");
    const backButton = pageRoot.querySelector('[data-action="page-test-back-home"]');
    const saveButton = pageRoot.querySelector('[data-action="page-test-save-result"]');

    dropzone?.addEventListener("click", (event) => {
      if (event.target.closest('[data-action="page-test-remove-image"]')) {
        return;
      }

      if (state.isGenerating || state.isFollowUpLoading) {
        return;
      }
      fileInput?.click();
    });

    dropzone?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      fileInput?.click();
    });

    dropzone?.addEventListener("dragenter", (event) => {
      event.preventDefault();
      state.isDragging = true;
      renderUploadZone();
    });

    dropzone?.addEventListener("dragover", (event) => {
      event.preventDefault();
      state.isDragging = true;
      renderUploadZone();
    });

    dropzone?.addEventListener("dragleave", (event) => {
      if (event.currentTarget.contains(event.relatedTarget)) {
        return;
      }

      state.isDragging = false;
      renderUploadZone();
    });

    dropzone?.addEventListener("drop", (event) => {
      event.preventDefault();
      state.isDragging = false;
      renderUploadZone();

      const [file] = Array.from(event.dataTransfer?.files || []);
      if (file) {
        void handleSelectedFile(file);
      }
    });

    fileInput?.addEventListener("change", (event) => {
      const [file] = Array.from(event.target.files || []);
      if (file) {
        void handleSelectedFile(file);
      }

      event.target.value = "";
    });

    taskInput?.addEventListener("input", (event) => {
      state.taskDescription = event.target.textContent || "";
      state.isSaved = false;
      renderGenerateButton();
    });

    ["pointerdown", "mousedown", "click"].forEach((eventName) => {
      taskInput?.addEventListener(eventName, (event) => {
        event.stopPropagation();
        focusTaskInputAtEnd(event.currentTarget);
      });
    });

    taskInput?.addEventListener("compositionstart", () => {
      isTaskComposing = true;
    });

    taskInput?.addEventListener("compositionend", (event) => {
      isTaskComposing = false;
      state.taskDescription = event.target.textContent || "";
      renderGenerateButton();
    });

    taskInput?.addEventListener("blur", (event) => {
      state.taskDescription = event.target.textContent || "";
      renderGenerateButton();
      renderBottomBar();
    });

    backButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      tryReturnHome();
    });

    saveButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSaveDialog();
    });
  }

  function renderPage() {
    renderUploadZone();
    renderToolbar();
    renderResults();
    renderBottomBar();
  }

  function renderUploadZone() {
    if (!pageRoot) {
      return;
    }

    const dropzone = pageRoot.querySelector("[data-page-test-dropzone]");
    if (!dropzone) {
      return;
    }

    const dragClass = state.isDragging ? " is-dragging" : "";

    if (state.image) {
      dropzone.className = `page-test-upload__frame has-image${dragClass}`;
      dropzone.innerHTML = `
        <img class="page-test-upload__preview" src="${state.image.dataUrl}" alt="页面截图预览">
        <button class="page-test-upload__delete" type="button" data-action="page-test-remove-image" aria-label="删除当前图片">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M6 6l12 12"></path>
            <path d="M18 6L6 18"></path>
          </svg>
        </button>
      `;
      return;
    }

    dropzone.className = `page-test-upload__frame${dragClass}`;
    dropzone.innerHTML = `
      <div class="page-test-upload__empty">
        <span class="page-test-upload__icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" focusable="false">
            <path d="M20 39a10 10 0 0 1 1.6-19.87A14 14 0 0 1 48 22a9 9 0 1 1 1 17H20Z"></path>
            <path d="M32 40V23"></path>
            <path d="M25 30l7-7 7 7"></path>
          </svg>
        </span>
        <p class="page-test-upload__title">拖拽、粘贴或点击上传页面截图</p>
        <p class="page-test-upload__hint">支持 PNG、JPG 格式，建议尺寸与手机屏幕一致</p>
        <div class="page-test-upload__footer">
          <span>拖拽文件</span>
          <span aria-hidden="true">·</span>
          <span>Ctrl+V 粘贴</span>
          <span aria-hidden="true">·</span>
          <span>点击选择</span>
        </div>
      </div>
    `;
  }

  function renderToolbar() {
    if (!pageRoot) {
      return;
    }

    const personaButton = pageRoot.querySelector(".page-test-persona-picker");
    const selectedPersona = getSelectedPersona();
    const personaLabel = selectedPersona?.role || state.historyViewPersonaName || "";
    const taskInput = pageRoot.querySelector("[data-page-test-task-input]");

    if (personaButton) {
      personaButton.classList.toggle("has-value", Boolean(personaLabel));
      personaButton.innerHTML = personaLabel
        ? `
          <span class="page-test-persona-picker__value">${escapeHtml(personaLabel)}</span>
          <span class="page-test-persona-picker__switch">切换</span>
        `
        : `
          <span class="page-test-persona-picker__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="8" r="3.2"></circle>
              <path d="M6.5 18.2c0-2.8 2.45-4.7 5.5-4.7s5.5 1.9 5.5 4.7"></path>
            </svg>
          </span>
          <span class="page-test-persona-picker__value">请选择用户画像</span>
        `;
    }

    if (taskInput && taskInput !== document.activeElement && !isTaskComposing && taskInput.textContent !== state.taskDescription) {
      taskInput.textContent = state.taskDescription;
    }

    renderGenerateButton();
  }

  function renderGenerateButton() {
    if (!pageRoot) {
      return;
    }

    const generateButton = pageRoot.querySelector(".page-test-generate-button");
    const canGenerate = hasRequiredFields() && !state.isGenerating;

    if (!generateButton) {
      return;
    }

    generateButton.classList.toggle("is-ready", canGenerate);
    generateButton.classList.toggle("is-incomplete", !canGenerate && !state.isGenerating);
    generateButton.classList.toggle("is-loading", state.isGenerating);

    const nextMode = state.isGenerating ? "loading" : "idle";
    if (generateButton.dataset.mode === nextMode) {
      return;
    }

    generateButton.dataset.mode = nextMode;
    generateButton.innerHTML = state.isGenerating
      ? '<span class="page-test-button-spinner" aria-hidden="true"></span><span>生成中</span>'
      : "<span>开始生成</span>";
  }

  function renderResults() {
    if (!pageRoot) {
      return;
    }

    const regenerateButton = pageRoot.querySelector(".page-test-results__regenerate");
    const resultsContent = pageRoot.querySelector("[data-page-test-results-content]");

    if (!resultsContent || !regenerateButton) {
      return;
    }

    regenerateButton.hidden = !state.hasGenerated;
    regenerateButton.disabled = state.isGenerating;
    regenerateButton.innerHTML = `
      <span class="page-test-results__regenerate-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M20 11a8 8 0 1 0 2 5.3"></path>
          <path d="M20 5v6h-6"></path>
        </svg>
      </span>
      <span>重新生成</span>
    `;

    if (state.isGenerating) {
      resultsContent.innerHTML = `
        <div class="page-test-results__loading">
          <span class="page-test-results__loading-spinner" aria-hidden="true"></span>
          <p class="page-test-results__loading-text">AI 正在分析页面可用性，请稍候...</p>
        </div>
      `;
      return;
    }

    if (!state.hasGenerated) {
      resultsContent.innerHTML = `
        <div class="page-test-results__empty">
          <span class="page-test-results__empty-icon" aria-hidden="true">
            <svg viewBox="0 0 64 64" focusable="false">
              <path d="M19 42h26c6.1 0 11-4.7 11-10.5 0-5.4-4.1-9.8-9.4-10.4C45 14.8 39.3 10 32.5 10 24.8 10 18.4 16.1 17.8 23.9 12.2 24.7 8 29.3 8 34.9 8 38.8 10 42 19 42Z"></path>
              <path d="M32 44V27"></path>
              <path d="M25.5 33.5 32 27l6.5 6.5"></path>
            </svg>
          </span>
          <p class="page-test-results__empty-text">上传页面截图、选择用户画像并填写任务描述后，即可获得 6 个维度的可用性分析结果。</p>
        </div>
      `;
      return;
    }

    resultsContent.innerHTML = `
      <div class="page-test-results__stack">
        ${state.resultSections.map(renderResultSection).join("")}
        <section class="page-test-followup">
          <div class="page-test-followup__composer">
            <div
              class="page-test-followup__input"
              contenteditable="${state.isFollowUpLoading ? "false" : "true"}"
              role="textbox"
              aria-multiline="true"
              data-page-test-followup-input
              data-placeholder="继续追问用户的具体问题、行为动机或困惑点（如：用户为什么会误触这个按钮？）..."
            >${escapeHtml(state.followUpQuestion)}</div>
            <button class="button button--primary page-test-followup__send" type="button" data-action="page-test-send-followup">
              ${state.isFollowUpLoading ? '<span class="page-test-button-spinner" aria-hidden="true"></span><span>发送中</span>' : "<span>发送</span>"}
            </button>
          </div>
          <div class="page-test-followup__history">
            ${state.followUps
              .map((item, index) => ({ item, index }))
              .sort((left, right) => Number(right.item.timestamp || 0) - Number(left.item.timestamp || 0))
              .map(({ item, index }) => renderFollowUpCardItem(item, index))
              .join("")}
          </div>
        </section>
      </div>
    `;

    const followupInput = pageRoot.querySelector("[data-page-test-followup-input]");
    followupInput?.addEventListener("input", (event) => {
      state.followUpQuestion = event.target.textContent || "";
    });
    ["pointerdown", "mousedown", "click"].forEach((eventName) => {
      followupInput?.addEventListener(eventName, (event) => {
        event.stopPropagation();
        followUpFocusGuardUntil = Date.now() + 400;
        focusPageTestFollowUpInputAtEnd(event.currentTarget);
      });
    });
    followupInput?.addEventListener("focus", () => {
      followUpFocusGuardUntil = Date.now() + 400;
    });
    followupInput?.addEventListener("blur", (event) => {
      if (state.isFollowUpLoading || isFollowUpComposing || Date.now() > followUpFocusGuardUntil) {
        return;
      }

      global.requestAnimationFrame(() => {
        const activeElement = document.activeElement;
        if (activeElement === event.currentTarget) {
          return;
        }

        if (activeElement instanceof HTMLElement && activeElement.closest(".page-test-followup")) {
          return;
        }

        focusPageTestFollowUpInputAtEnd(event.currentTarget);
      });
    });
    followupInput?.addEventListener("compositionstart", () => {
      isFollowUpComposing = true;
    });
    followupInput?.addEventListener("compositionend", (event) => {
      isFollowUpComposing = false;
      state.followUpQuestion = event.target.textContent || "";
    });
  }

  function renderResultSection(section) {
    const iconMarkup = section.icon || createSectionIcon(section.theme);
    const body = section.body.map((paragraph) => `<p class="page-test-result-card__paragraph">${escapeHtml(paragraph)}</p>`).join("");
    const notes = section.notes.length
      ? `
        <div class="page-test-result-card__note-box">
          ${section.notes.map((note) => `<p class="page-test-result-card__note">${escapeHtml(note)}</p>`).join("")}
        </div>
      `
      : "";
    const metrics = "";
    const badge = section.badge
      ? `<span class="page-test-result-card__badge">${escapeHtml(section.badge)}</span>`
      : "";

    return `
      <article class="page-test-result-card page-test-result-card--${section.theme}">
        <div class="page-test-result-card__header">
          <div class="page-test-result-card__title-wrap">
            <span class="page-test-result-card__icon" aria-hidden="true">${iconMarkup}</span>
            <h3 class="page-test-result-card__title">${escapeHtml(section.title)}</h3>
          </div>
          ${badge}
        </div>
        ${metrics}
        <div class="page-test-result-card__body">
          ${body}
        </div>
        ${notes}
      </article>
    `;
  }

  function renderFollowUpItem(item) {
    return `
      <article class="page-test-followup__item">
        <p class="page-test-followup__question">追问：${escapeHtml(item.question)}</p>
        <p class="page-test-followup__answer">${escapeHtml(item.answer)}</p>
      </article>
    `;
  }

  function renderFollowUpCardItem(item, index) {
    return `
      <article class="page-test-followup__item">
        <button class="page-test-followup__delete" type="button" data-action="page-test-delete-followup" data-followup-index="${index}" aria-label="删除这条追问">
          <span aria-hidden="true">×</span>
        </button>
        <p class="page-test-followup__question">追问：${escapeHtml(item.question)}</p>
        <p class="page-test-followup__answer">${escapeHtml(item.answer)}</p>
      </article>
    `;
  }

  function deleteFollowUp(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.followUps.length) {
      return;
    }

    state.followUps.splice(index, 1);
    state.isSaved = false;
    renderResults();
  }

  function renderBottomBar() {
    if (!pageRoot) {
      return;
    }

    const saveButton = pageRoot.querySelector(".page-test-bottom-bar__button--save");
    if (!saveButton) {
      return;
    }

    const canSave = state.hasGenerated && !state.isGenerating;
    saveButton.classList.toggle("is-disabled", !canSave);
  }

  async function handleSelectedFile(file) {
    const validationMessage = validateFile(file);
    if (validationMessage) {
      showToast(validationMessage, "error");
      return;
    }

    try {
      const imageData = await readImageFile(file);
      state.image = imageData;
      state.isSaved = false;

      if (imageData.width < 360 || imageData.height < 780) {
        showToast("图片尺寸过小，建议上传与手机屏幕尺寸（360×780）相近的图片，以保证分析准确性", "warning");
      } else {
        showToast("页面截图上传成功", "success");
      }

      renderPage();
    } catch (error) {
      showToast("上传失败，请检查文件格式及网络状态后重试", "error");
    }
  }

  function validateFile(file) {
    const type = String(file.type || "").toLowerCase();
    const validTypes = ["image/png", "image/jpeg", "image/jpg"];

    if (!validTypes.includes(type)) {
      return "仅支持 PNG、JPG 格式文件，请重新上传";
    }

    if (file.size > 10 * 1024 * 1024) {
      return "图片过大，请上传 10MB 以内的图片";
    }

    return "";
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => {
        reject(new Error("read-error"));
      };

      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl: String(reader.result || ""),
            width: image.width,
            height: image.height,
          });
        };
        image.onerror = () => reject(new Error("image-error"));
        image.src = String(reader.result || "");
      };

      reader.readAsDataURL(file);
    });
  }

  function buildGeneratedSections() {
    const persona = getSelectedPersona();
    const personaName = persona?.role || "目标用户";
    const task = state.taskDescription.trim();
    const baseScore = Math.max(2, Math.min(5, Math.round(task.length / 16)));
    const duration = `${(2 + baseScore * 0.3).toFixed(1)} 分钟`;
    const clicks = `${3 + baseScore} 步`;
    const backtracks = `${Math.max(0, baseScore - 3)} 次`;

    return [
      {
        theme: "visual",
        title: "1. 视觉顺序",
        icon: createSectionIcon("visual"),
        badge: "视觉路径清晰",
        body: [
          `第一眼会被页面中的核心标题和高对比操作区吸引，${personaName} 可以快速确认当前页面的主任务。`,
          `第二眼会转向与“${task}”最相关的主按钮与输入区域，视觉动线基本符合从上到下、从左到右的使用预期。`,
          "最后关注结果反馈与辅助说明区域，整体层级较清晰，但局部信息密度稍高时仍可能分散注意力。",
        ],
        notes: ["符合预期：视觉焦点基本与任务路径一致，无明显遮挡或优先级冲突。"],
      },
      {
        theme: "completion",
        title: "2. 任务完成度",
        icon: createSectionIcon("completion"),
        badge: "成功完成",
        body: [
          `${personaName} 可以在较少引导下完成“${task}”相关操作，关键路径识别成本较低。`,
          "若页面内存在次级入口或弱提示区，完成速度会略微下降，但不会阻断主任务。",
        ],
        notes: ["关键节点：上传/识别顺利，任务路径完整，用户可以独立完成主要操作。"],
      },
      {
        theme: "efficiency",
        title: "3. 效率与流畅度",
        icon: createSectionIcon("efficiency"),
        body: [
          "主路径步骤控制得较为紧凑，用户基本可以顺着页面结构连续推进，不需要频繁回看说明。",
          "若把提示语再聚焦到关键动作上，整体节奏还可以再快一点。",
        ],
        metrics: [
          { value: duration, label: "完成时长" },
          { value: backtracks, label: "回退次数" },
        ],
        notes: ["路径评价：流程自然、切换平滑，几乎没有额外试错动作。"],
      },
      {
        theme: "cognition",
        title: "4. 理解与认知匹配",
        icon: createSectionIcon("cognition"),
        badge: "理解程度：良好",
        body: [
          `${personaName} 对页面结构和功能入口理解较快，能把界面中的主要元素与“${task}”建立对应关系。`,
          "个别文案如果过于抽象，可能让用户在第一次浏览时需要再确认一次含义。",
        ],
        notes: ["轻微困惑点：建议把关键按钮文案写得更贴近任务目标，减少用户自行翻译界面语言的成本。"],
      },
      {
        theme: "errors",
        title: "5. 错误与容错性",
        icon: createSectionIcon("errors"),
        body: [
          "当前页面在主要任务路径上误触概率不高，但次要操作和退出动作仍建议增加更明确的反馈。",
          "如果用户在中途切换配置或误点返回，最好给出二次确认，以降低结果丢失的风险。",
        ],
        notes: [
          "容错设计缺失：建议在覆盖结果、返回首页、删除内容等场景增加确认提示。",
          "错误提示需要更贴近用户当前动作，减少“发生了什么”的理解成本。",
        ],
      },
      {
        theme: "satisfaction",
        title: "6. 主观体验与满意度",
        icon: createSectionIcon("satisfaction"),
        badge: "整体体验：轻松高效",
        body: [
          `${personaName} 会认为页面完成任务的路径比较直接，主要流程不需要额外学习成本。`,
          "只要关键按钮和反馈信息维持当前清晰度，整体满意度会保持在较高水平。",
          "典型反馈：'操作路径很好懂，知道下一步该做什么。'、'如果提示再明确一点，会更有把握。'",
        ],
        notes: ["体验评价：页面友好度较高，结构清楚，适合作为高频操作页面继续优化。"],
      },
    ];
  }

  function createSectionIcon(type) {
    const icons = {
      visual:
        '<svg viewBox="0 0 24 24" focusable="false"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.7"></circle></svg>',
      completion:
        '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.3 2.2 2.2 4.8-4.8"></path></svg>',
      efficiency:
        '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
      cognition:
        '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M9.8 9.4a2.6 2.6 0 1 1 4 2.2c-.9.5-1.3 1-1.3 1.9"></path><path d="M12 17h.01"></path></svg>',
      errors:
        '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5"></path><path d="M12 16h.01"></path></svg>',
      satisfaction:
        '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3.5 14.5 8l5 .7-3.6 3.5.9 5-4.3-2.3-4.3 2.3.9-5L5.5 8.7l5-.7L12 3.5Z"></path></svg>',
    };

    return icons[type] || icons.visual;
  }

  function showToast(message, tone) {
    if (!toastRoot) {
      return;
    }

    const toast = document.createElement("div");
    toast.className = `page-test-toast page-test-toast--${tone || "info"}`;
    toast.textContent = message;
    toastRoot.replaceChildren(toast);

    global.clearTimeout(showToast.timer);
    showToast.timer = global.setTimeout(() => {
      if (toast.isConnected) {
        toast.remove();
      }
    }, 3000);
  }

  function openModal(markup, onMount) {
    if (!modalRoot) {
      return;
    }

    const preserveExisting = Boolean(arguments[2]?.preserveExisting);
    if (!preserveExisting) {
      closeAllModals();
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = markup.trim();
    const modalElement = wrapper.firstElementChild;
    if (!modalElement) {
      return;
    }

    modalRoot.appendChild(modalElement);
    modalStack.push({
      element: modalElement,
      cleanup: onMount ? onMount(modalElement) : null,
    });
  }

  function closeModal(targetElement) {
    if (!modalStack.length) {
      if (modalRoot) {
        modalRoot.replaceChildren();
      }
      return;
    }

    let targetIndex = modalStack.length - 1;
    if (targetElement) {
      const matchedIndex = modalStack.findIndex((entry) => entry.element === targetElement);
      if (matchedIndex >= 0) {
        targetIndex = matchedIndex;
      }
    }

    const [target] = modalStack.splice(targetIndex, 1);
    if (!target) {
      return;
    }

    target.cleanup?.();
    target.element.remove();

    if (!modalStack.length && modalRoot) {
      modalRoot.replaceChildren();
    }
  }

  function closeAllModals() {
    while (modalStack.length) {
      closeModal(modalStack[modalStack.length - 1].element);
    }
  }

  function createDialogShell(title, content, actions, sizeClass) {
    return `
      <div class="page-test-dialog" role="dialog" aria-modal="true" aria-labelledby="page-test-dialog-title">
        <button class="page-test-dialog__backdrop" type="button" data-dialog-close aria-label="关闭弹窗"></button>
        <div class="page-test-dialog__panel ${sizeClass || ""}">
          <div class="page-test-dialog__header">
            <h2 id="page-test-dialog-title" class="page-test-dialog__title">${title}</h2>
            <button class="page-test-dialog__close" type="button" data-dialog-close aria-label="关闭弹窗">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M6 6l12 12"></path>
                <path d="M18 6L6 18"></path>
              </svg>
            </button>
          </div>
          <div class="page-test-dialog__content">${content}</div>
          <div class="page-test-dialog__actions">${actions}</div>
        </div>
      </div>
    `;
  }

  function mountDismissableModal(modalElement, extraBind) {
    const closeCurrentModal = () => {
      closeModal(modalElement);
    };
    const closeTargets = modalElement.querySelectorAll("[data-dialog-close]");
    closeTargets.forEach((target) => target.addEventListener("click", closeCurrentModal));
    if (extraBind) {
      extraBind(modalElement);
    }

    return () => {
      closeTargets.forEach((target) => target.removeEventListener("click", closeCurrentModal));
    };
  }

  function openConfirmDialog(options) {
    const markup = createDialogShell(
      options.title,
      `<p class="page-test-dialog__message">${escapeHtml(options.message)}</p>`,
      `
        <button class="button button--subtle page-test-dialog__button" type="button" data-dialog-close>${options.cancelText || "取消"}</button>
        <button class="button ${options.confirmTone === "danger" ? "page-test-dialog__button page-test-dialog__button--danger" : "button--primary page-test-dialog__button"}" type="button" data-dialog-confirm>${options.confirmText || "确定"}</button>
      `,
    );

    openModal(markup, (modalElement) =>
      mountDismissableModal(modalElement, () => {
        modalElement.querySelector("[data-dialog-confirm]")?.addEventListener("click", () => {
          closeModal();
          options.onConfirm?.();
        });
      }),
    );
  }

  function openPersonaPicker() {
    const personas = readPersonas();
    const listMarkup = personas.length
      ? personas
          .map(
            (persona) => `
              <button class="page-test-persona-option${persona.id === state.selectedPersonaId ? " is-active" : ""}" type="button" data-persona-id="${persona.id}">
                <strong>${escapeHtml(persona.role)}</strong>
                <span>${escapeHtml(persona.description)}</span>
              </button>
            `,
          )
          .join("")
      : `
          <div class="page-test-dialog__empty-block">
            <p>暂无用户画像，请先新建用户画像。</p>
            <button class="button button--primary page-test-dialog__button" type="button" data-action="page-test-open-inline-persona-create">新建用户画像</button>
          </div>
        `;

    const actions = personas.length
      ? `
          <button class="button button--subtle page-test-dialog__button" type="button" data-dialog-close>取消</button>
          <button class="button button--primary page-test-dialog__button" type="button" data-action="page-test-open-inline-persona-create">新建用户画像</button>
        `
      : `<button class="button button--subtle page-test-dialog__button" type="button" data-dialog-close>关闭</button>`;

    const markup = createDialogShell(
      "用户画像管理",
      `<div class="page-test-persona-list">${listMarkup}</div>`,
      actions,
      "page-test-dialog__panel--persona",
    );

    openModal(markup, (modalElement) =>
      mountDismissableModal(modalElement, () => {
        modalElement.querySelectorAll("[data-persona-id]").forEach((button) => {
          button.addEventListener("click", () => {
            state.selectedPersonaId = button.dataset.personaId || "";
            state.isSaved = false;
            closeModal(modalElement);
            renderToolbar();
          });
        });

        modalElement.querySelectorAll('[data-action="page-test-open-inline-persona-create"]').forEach((button) => {
          button.addEventListener("click", () => {
            openInlinePersonaCreateModal();
          });
        });
      }),
    );
  }

  function createInlinePersonaModalMarkup() {
    return `
      <div class="persona-modal persona-modal--page-test" role="dialog" aria-modal="true" aria-labelledby="page-test-persona-create-title">
        <button class="persona-modal__backdrop" type="button" aria-label="关闭弹窗"></button>
        <div class="persona-modal__dialog">
          <div class="persona-modal__header">
            <h2 id="page-test-persona-create-title" class="persona-modal__title">新增用户画像</h2>
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
                data-inline-persona-field="role"
              >
              <span class="persona-modal__error is-hidden" data-inline-persona-error="role"></span>
            </label>

            <label class="persona-modal__field persona-modal__field--textarea">
              <span class="persona-modal__label">用户详细特征</span>
              <textarea
                class="persona-modal__textarea"
                placeholder="请输入用户的年龄、背景、技术能力、性格、任务目标等详细信息"
                data-inline-persona-field="description"
              ></textarea>
              <span class="persona-modal__error is-hidden" data-inline-persona-error="description"></span>
            </label>

            <span class="persona-modal__error persona-modal__error--submit is-hidden" data-inline-persona-error="submit"></span>

            <button class="button button--primary persona-modal__submit" type="button" data-inline-persona-submit>
              确定创建
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function validateInlinePersona(role, description) {
    const errors = {};
    const trimmedRole = role.trim();
    const trimmedDescription = description.trim();

    if (!trimmedRole) {
      errors.role = "请输入用户类型";
    } else if (trimmedRole.length > 20) {
      errors.role = "用户类型不能超过20个字符";
    } else if (!/^[\u4e00-\u9fa5A-Za-z0-9\s_-]+$/.test(trimmedRole)) {
      errors.role = "用户类型不能包含特殊字符";
    }

    if (!trimmedDescription) {
      errors.description = "请输入用户详细特征";
    }

    return errors;
  }

  function openInlinePersonaCreateModal() {
    const markup = createInlinePersonaModalMarkup();

    openModal(
      markup,
      (modalElement) => {
        const backdrop = modalElement.querySelector(".persona-modal__backdrop");
        const closeButton = modalElement.querySelector(".persona-modal__close");
        const submitButton = modalElement.querySelector("[data-inline-persona-submit]");
        const roleInput = modalElement.querySelector('[data-inline-persona-field="role"]');
        const descriptionInput = modalElement.querySelector('[data-inline-persona-field="description"]');
        const roleError = modalElement.querySelector('[data-inline-persona-error="role"]');
        const descriptionError = modalElement.querySelector('[data-inline-persona-error="description"]');
        const submitError = modalElement.querySelector('[data-inline-persona-error="submit"]');

        const closeCurrentModal = () => {
          closeModal(modalElement);
        };

        const clearError = (field) => {
          const node = field === "role" ? roleError : descriptionError;
          if (!node) {
            return;
          }
          node.textContent = "";
          node.classList.add("is-hidden");
          if (submitError) {
            submitError.textContent = "";
            submitError.classList.add("is-hidden");
          }
        };

        const submit = () => {
          const role = String(roleInput?.value || "");
          const description = String(descriptionInput?.value || "");
          const errors = validateInlinePersona(role, description);

          if (roleError) {
            roleError.textContent = errors.role || "";
            roleError.classList.toggle("is-hidden", !errors.role);
          }
          if (descriptionError) {
            descriptionError.textContent = errors.description || "";
            descriptionError.classList.toggle("is-hidden", !errors.description);
          }
          if (submitError) {
            submitError.textContent = "";
            submitError.classList.add("is-hidden");
          }

          if (errors.role || errors.description) {
            (errors.role ? roleInput : descriptionInput)?.focus();
            return;
          }

          try {
            const timestamp = Date.now();
            const newPersona = {
              id: `persona-${timestamp}`,
              role: role.trim(),
              description: description.trim(),
              createdAt: timestamp,
            };

            writePersonas([...readPersonas(), newPersona]);
            state.selectedPersonaId = newPersona.id;
            state.isSaved = false;
            closeAllModals();
            renderToolbar();
            showToast("新建用户画像成功", "success");
          } catch (error) {
            if (submitError) {
              submitError.textContent = "创建失败，请稍后重试";
              submitError.classList.remove("is-hidden");
            }
          }
        };

        backdrop?.addEventListener("click", closeCurrentModal);
        closeButton?.addEventListener("click", closeCurrentModal);
        submitButton?.addEventListener("click", submit);
        roleInput?.addEventListener("input", () => clearError("role"));
        descriptionInput?.addEventListener("input", () => clearError("description"));

        global.requestAnimationFrame(() => {
          roleInput?.focus();
        });

        return () => {
          backdrop?.removeEventListener("click", closeCurrentModal);
          closeButton?.removeEventListener("click", closeCurrentModal);
          submitButton?.removeEventListener("click", submit);
        };
      },
      { preserveExisting: true },
    );
  }

  function startGeneration() {
    const taskInput = pageRoot?.querySelector("[data-page-test-task-input]");
    if (taskInput) {
      state.taskDescription = taskInput.textContent || "";
    }

    if (!hasRequiredFields()) {
      state.isGenerateButtonPressed = true;
      const missingActions = getMissingRequiredActions();
      showToast(`请先${missingActions.join("、")}`, "warning");
      renderToolbar();
      return;
    }

    if (!global.navigator.onLine) {
      showToast("网络异常，请检查网络后重试", "error");
      return;
    }

    state.isGenerating = true;
    state.isSaved = false;
    state.resultError = "";
    renderToolbar();
    renderResults();
    renderBottomBar();

    const requestId = ++generationRequestId;
    void requestGeneratedSections(requestId);
  }

  function askForRegeneration() {
    if (!state.hasGenerated || state.isGenerating) {
      return;
    }

    openConfirmDialog({
      title: "重新生成结果",
      message: "确定要重新生成吗？当前结果将被覆盖，且无法恢复。",
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: startGeneration,
    });
  }

  function sendFollowUp() {
    if (!state.hasGenerated || state.isFollowUpLoading) {
      return;
    }

    const followupInput = pageRoot?.querySelector("[data-page-test-followup-input]");
    if (followupInput) {
      state.followUpQuestion = followupInput.textContent || "";
    }

    if (!state.followUpQuestion.trim()) {
      showToast("请输入追问内容", "error");
      return;
    }

    if (!global.navigator.onLine) {
      showToast("网络异常，请检查网络后重试", "error");
      return;
    }

    const question = state.followUpQuestion.trim();
    state.isFollowUpLoading = true;
    renderResults();

    const requestId = ++followUpRequestId;
    void requestFollowUpAnswer(question, requestId);
  }

  function removeImageWithConfirm() {
    if (!state.image) {
      return;
    }

    openConfirmDialog({
      title: "删除当前图片",
      message: "确定要删除当前图片吗？删除后需重新上传。",
      confirmText: "确定",
      cancelText: "取消",
      confirmTone: "danger",
      onConfirm: () => {
        state.image = null;
        state.hasGenerated = false;
        state.resultSections = [];
        state.followUps = [];
        state.followUpQuestion = "";
        state.generatedContext = null;
        state.isSaved = false;
        renderPage();
      },
    });
  }

  function tryReturnHome() {
    if (!hasUnsavedGeneratedResult()) {
      resetStateForExit();
      global.AppRouter?.setHashRoute("home");
      return;
    }

    openConfirmDialog({
      title: "返回首页",
      message: "确定返回吗？未保存的测试结果将丢失。",
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: () => {
        resetStateForExit();
        global.AppRouter?.setHashRoute("home");
      },
    });
  }

  function openSaveDialog() {
    if (!state.hasGenerated || state.isGenerating) {
      return;
    }

    const markup = createDialogShell(
      "保存测试结果",
      `
        <label class="page-test-dialog__field">
          <span class="page-test-dialog__field-label">任务名称</span>
          <input class="page-test-dialog__input" type="text" maxlength="30" placeholder="请输入任务名称" data-save-task-name>
          <span class="page-test-dialog__error is-hidden" data-save-error></span>
        </label>
      `,
      `
        <button class="button button--subtle page-test-dialog__button" type="button" data-dialog-close>取消</button>
        <button class="button button--primary page-test-dialog__button" type="button" data-save-confirm>确定</button>
      `,
    );

    openModal(markup, (modalElement) =>
      mountDismissableModal(modalElement, () => {
        const input = modalElement.querySelector("[data-save-task-name]");
        const errorNode = modalElement.querySelector("[data-save-error]");
        const confirmButton = modalElement.querySelector("[data-save-confirm]");

        global.requestAnimationFrame(() => input?.focus());

        confirmButton?.addEventListener("click", () => {
          const taskName = String(input?.value || "").trim();
          const errorMessage = validateTaskName(taskName);

          if (errorNode) {
            errorNode.textContent = errorMessage;
            errorNode.classList.toggle("is-hidden", !errorMessage);
          }

          if (errorMessage) {
            return;
          }

          try {
            saveHistoryRecord(taskName);
            state.isSaved = true;
            closeModal();
            showToast("保存成功", "success");
            global.setTimeout(() => {
              resetStateForExit();
              global.AppRouter?.setHashRoute("home");
            }, 700);
          } catch (error) {
            if (errorNode) {
              errorNode.textContent = "保存失败，请稍后重试";
              errorNode.classList.remove("is-hidden");
            }
          }
        });
      }),
    );
  }

  function validateTaskName(taskName) {
    if (!taskName) {
      return "请输入任务名称";
    }

    if (taskName.length > 30) {
      return "任务名称不能超过30字，请修改";
    }

    const hasDuplicate = readHistoryRecords().some((record) => record.taskName === taskName);
    if (hasDuplicate) {
      return "该任务名称已存在，请修改名称后保存";
    }

    return "";
  }

  function saveHistoryRecord(taskName) {
    const timestamp = Date.now();
    const generatedContext = state.generatedContext || {
      personaName: getSelectedPersona()?.role || "",
      taskDescription: state.taskDescription.trim(),
    };
    const records = readHistoryRecords();
    records.push({
      id: `history-${timestamp}`,
      date: formatDateTime(timestamp),
      timestamp,
      taskName,
      personaId: generatedContext.personaId || state.selectedPersonaId || "",
      userType: generatedContext.personaName,
      taskDescription: generatedContext.taskDescription,
      resultSections: state.resultSections,
      followUps: state.followUps,
      screenshot: generatedContext.imageDataUrl || "",
      testType: "page-test",
    });
    writeHistoryRecords(records);
  }

  function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  function resetStateForExit() {
    global.clearTimeout(generateTimer);
    global.clearTimeout(followUpTimer);
    generationRequestId += 1;
    followUpRequestId += 1;
    Object.assign(state, createDefaultState());
    closeAllModals();
  }

  async function requestGeneratedSections(requestId) {
    const payload = {
      route: "page-test",
      screenshot: {
        name: state.image?.name || "",
        type: state.image?.type || "",
        dataUrl: state.image?.dataUrl || "",
        width: state.image?.width || 0,
        height: state.image?.height || 0,
      },
      persona: getSelectedPersona(),
      taskDescription: state.taskDescription.trim(),
    };

    try {
      const sections = global.AppAI?.analyzePageTest
        ? await global.AppAI.analyzePageTest(payload, {
            fallback: () => buildGeneratedSections(),
          })
        : buildGeneratedSections();

      if (requestId !== generationRequestId) {
        return;
      }

      state.resultSections = Array.isArray(sections) ? sections : [];
      state.generatedContext = {
        imageName: state.image?.name || "",
        imageDataUrl: state.image?.dataUrl || "",
        personaId: state.selectedPersonaId,
        personaName: getSelectedPersona()?.role || "",
        taskDescription: state.taskDescription.trim(),
        aiApiId: global.AppAI?.getConfig?.().apiId || "",
      };
      state.hasGenerated = true;
      state.isGenerating = false;
      state.followUps = [];
      state.followUpQuestion = "";
      renderToolbar();
      renderResults();
      renderBottomBar();
    } catch (error) {
      if (requestId !== generationRequestId) {
        return;
      }

      const errorMessage = resolveAiErrorMessage(error);
      console.error("[PageTest] analyze failed:", error);

      state.resultSections = [];
      state.generatedContext = null;
      state.hasGenerated = false;
      state.isGenerating = false;
      state.resultError = "AI未连接成功";
      renderToolbar();
      renderResults();
      renderBottomBar();
      showToast("AI未连接成功", "error");
    }
  }

  async function requestFollowUpAnswer(question, requestId) {
    const payload = {
      route: "page-test",
      question,
      persona: getSelectedPersona(),
      taskDescription: state.taskDescription.trim(),
      resultSections: state.resultSections,
    };

    try {
      const answer = global.AppAI?.followUpPageTest
        ? await global.AppAI.followUpPageTest(payload, {
            fallback: () => buildFollowUpAnswer(question),
          })
        : buildFollowUpAnswer(question);

      if (requestId !== followUpRequestId) {
        return;
      }

      state.followUps.push({ question, answer, timestamp: Date.now() });
      state.followUpQuestion = "";
      state.isFollowUpLoading = false;
      state.isSaved = false;
      renderResults();
      renderBottomBar();
    } catch (error) {
      if (requestId !== followUpRequestId) {
        return;
      }

      state.isFollowUpLoading = false;
      renderResults();
      showToast("AI未连接成功", "error");
    }
  }

  function buildFollowUpAnswer(question) {
    const personaName = getSelectedPersona()?.role || "该用户";
    const focusPoint = question ? `针对“${question}”这个问题，` : "";
    return `${focusPoint}${personaName} 更可能受到当前页面提示方式和按钮层级的影响。建议重点观察用户是否先理解任务目标，再决定点击路径；若出现迟疑，通常说明文案或反馈还不够明确。`;
  }

  function focusPageTestFollowUpInputAtEnd(target) {
    if (!target) {
      return;
    }

    global.requestAnimationFrame(() => {
      target.focus();

      const selection = global.getSelection?.();
      if (!selection) {
        return;
      }

      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    switch (actionTarget.dataset.action) {
      case "page-test-open-persona-modal":
        openPersonaPicker();
        return;
      case "page-test-generate":
        startGeneration();
        return;
      case "page-test-regenerate":
        askForRegeneration();
        return;
      case "page-test-send-followup":
        sendFollowUp();
        return;
      case "page-test-delete-followup":
        deleteFollowUp(Number(actionTarget.dataset.followupIndex));
        return;
      case "page-test-remove-image":
        removeImageWithConfirm();
        return;
      case "page-test-back-home":
        tryReturnHome();
        return;
      case "page-test-save-result":
        openSaveDialog();
        return;
      default:
        break;
    }
  });

  document.addEventListener("paste", (event) => {
    if (document.body.dataset.route !== "page-test") {
      return;
    }

    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => String(item.type || "").startsWith("image/"));
    const file = imageItem?.getAsFile();

    if (!file) {
      return;
    }

    event.preventDefault();
    void handleSelectedFile(file);
  });

  global.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedGeneratedResult()) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });

  global.PageTestPage = {
    createPageTestPage,
    mountPageTestPage,
  };
})(window);
