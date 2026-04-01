(function attachFlowTestPage(global) {
  const PERSONAS_STORAGE_KEY = "ai-usability-personas";
  const HISTORY_STORAGE_KEY = "ai-usability-history-records";
  const HISTORY_VIEW_STORAGE_KEY = "ai-usability-history-view-record";
  const FLOW_TEST_DRAFT_STORAGE_KEY = "ai-usability-flow-test-draft";
  const modalRoot = document.querySelector("#modal-root");
  const toastRoot = document.querySelector("#toast-root");

  let state = createDefaultState();
  let flowTestNextState = createFlowTestNextDefaultState();
  let pageRoot = null;
  let canvasRoot = null;
  let fileInput = null;
  let nextPageRoot = null;
  let pendingUploadNodeId = "";
  let autoAppendTimer = null;
  let isPasteBound = false;
  let hasMountedOnce = false;
  let isNextTaskComposing = false;
  let isNextFollowUpComposing = false;
  let flowTestNextFollowUpFocusGuardUntil = 0;
  let flowTestNextGenerationRequestId = 0;
  let flowTestNextFollowUpRequestId = 0;

  function createNode(id, options) {
    return {
      id,
      isDefault: Boolean(options?.isDefault),
      status: "empty",
      image: null,
      errorMessage: "",
      isDragTarget: false,
    };
  }

  function createDefaultState() {
    const firstId = createNodeId();
    const secondId = createNodeId();

    return {
      nodes: [createNode(firstId, { isDefault: true }), createNode(secondId, { isDefault: true })],
      actionTexts: [""],
      selectedNodeId: firstId,
      viewerImage: null,
    };
  }

  function createFlowTestNextDefaultState() {
    return {
      selectedPersonaId: "",
      taskDescription: "",
      isGenerating: false,
      hasGenerated: false,
      resultSections: [],
      followUps: [],
      followUpQuestion: "",
      isFollowUpLoading: false,
      isSaved: false,
      historyViewPersonaName: "",
    };
  }

  function createNodeId() {
    return `flow-node-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function resetState() {
    global.clearTimeout(autoAppendTimer);
    pendingUploadNodeId = "";
    state = createDefaultState();
  }

  function resetFlowTestNextState() {
    flowTestNextState = createFlowTestNextDefaultState();
    closeFlowModal();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getNodeById(nodeId) {
    return state.nodes.find((node) => node.id === nodeId) || null;
  }

  function getNodeIndex(nodeId) {
    return state.nodes.findIndex((node) => node.id === nodeId);
  }

  function getSelectedNode() {
    return getNodeById(state.selectedNodeId);
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

  function buildFlowTestDraft() {
    return {
      nodes: state.nodes.map((node) => ({
        id: node.id,
        isDefault: Boolean(node.isDefault),
        status: node.status === "uploaded" && node.image?.dataUrl ? "uploaded" : "empty",
        imageName: node.image?.name || "",
        imageDataUrl: node.image?.dataUrl || "",
      })),
      actionTexts: Array.isArray(state.actionTexts) ? [...state.actionTexts] : [],
      selectedNodeId: state.selectedNodeId || "",
    };
  }

  function writeFlowTestDraft() {
    try {
      const raw = JSON.stringify(buildFlowTestDraft());
      global.sessionStorage?.setItem(FLOW_TEST_DRAFT_STORAGE_KEY, raw);
      global.localStorage?.setItem(FLOW_TEST_DRAFT_STORAGE_KEY, raw);
    } catch (error) {
      return;
    }
  }

  function readFlowTestDraft() {
    try {
      const raw =
        global.sessionStorage?.getItem(FLOW_TEST_DRAFT_STORAGE_KEY) ||
        global.localStorage?.getItem(FLOW_TEST_DRAFT_STORAGE_KEY);

      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      return parsed && Array.isArray(parsed.nodes) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function clearFlowTestDraft() {
    global.sessionStorage?.removeItem(FLOW_TEST_DRAFT_STORAGE_KEY);
    global.localStorage?.removeItem(FLOW_TEST_DRAFT_STORAGE_KEY);
  }

  function hydrateFlowTestDraft(draft) {
    if (!draft || !Array.isArray(draft.nodes) || !draft.nodes.length) {
      return false;
    }

    const restoredNodes = draft.nodes.map((node, index) => ({
      id: node.id || createNodeId(),
      isDefault: Boolean(node.isDefault ?? index < 2),
      status: node.status === "uploaded" && node.imageDataUrl ? "uploaded" : "empty",
      image:
        node.status === "uploaded" && node.imageDataUrl
          ? {
              name: node.imageName || `流程页面${index + 1}`,
              type: "image/png",
              dataUrl: node.imageDataUrl,
              width: 0,
              height: 0,
            }
          : null,
      errorMessage: "",
      isDragTarget: false,
    }));

    const actionTexts = Array.isArray(draft.actionTexts)
      ? [...draft.actionTexts]
      : Array.from({ length: Math.max(0, restoredNodes.length - 1) }, () => "");

    while (actionTexts.length < Math.max(0, restoredNodes.length - 1)) {
      actionTexts.push("");
    }

    state = {
      ...state,
      nodes: restoredNodes,
      actionTexts,
      selectedNodeId:
        restoredNodes.some((node) => node.id === draft.selectedNodeId)
          ? draft.selectedNodeId
          : restoredNodes.find((node) => node.status !== "uploaded")?.id || restoredNodes[restoredNodes.length - 1]?.id || "",
      viewerImage: null,
    };

    return true;
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

  function hydrateFlowTestViewFromHistory(record) {
    if (!record || record.testType !== "flow-test") {
      return;
    }

    const selectedPersonaId = findMatchingPersonaId(record);
    flowTestNextState = {
      ...createFlowTestNextDefaultState(),
      selectedPersonaId,
      taskDescription: String(record.taskDescription || ""),
      hasGenerated: true,
      isSaved: true,
      resultSections: Array.isArray(record.resultSections) ? record.resultSections : [],
      followUps: Array.isArray(record.followUps) ? record.followUps : [],
      historyViewPersonaName: record.userType || "",
    };

    if (hydrateFlowTestDraft(record.flowDraft)) {
      writeFlowTestDraft();
      return;
    }

    const uploadedNodes = Array.isArray(record.uploadedNodes) ? record.uploadedNodes : [];
    if (!uploadedNodes.length) {
      return;
    }

    hydrateFlowTestDraft({
      nodes: uploadedNodes.map((node, index) => ({
        id: node.id || createNodeId(),
        isDefault: index < 2,
        status: node.imageDataUrl ? "uploaded" : "empty",
        imageName: node.imageName || `流程页面${index + 1}`,
        imageDataUrl: node.imageDataUrl || "",
      })),
      actionTexts: Array.isArray(record.actionDescriptions) ? record.actionDescriptions : [],
      selectedNodeId: "",
    });
    writeFlowTestDraft();
  }

  function hasEmptyNode() {
    return state.nodes.some((node) => node.status !== "uploaded");
  }

  function createFlowTestPage() {
    return `
      <section class="flow-test-stage" data-flow-test-root>
        <div class="flow-test-stage__canvas-shell">
          <div class="flow-test-stage__canvas" data-flow-test-canvas></div>
        </div>

        <input
          class="flow-test-stage__file-input"
          type="file"
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          data-flow-test-file-input
          hidden
        >

        <div class="flow-test-stage__bottom-bar">
          <div class="flow-test-stage__bottom-inner">
            <div class="flow-test-stage__bottom-actions">
              <button class="button button--subtle flow-test-stage__bottom-button" type="button" data-action="flow-test-reset">
                重置
              </button>
              <button class="button button--subtle flow-test-stage__bottom-button" type="button" data-action="flow-test-back">
                返回
              </button>
              <button class="button button--primary flow-test-stage__bottom-button flow-test-stage__bottom-button--next" type="button" data-action="flow-test-next">
                下一步
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function createFlowTestNextPage() {
    return `
      <section class="flow-test-step2" data-flow-test-next-root>
        <div class="flow-test-step2__body">
            <div class="flow-test-step2__toolbar">
              <div class="flow-test-step2__field flow-test-step2__field--persona">
                <span class="flow-test-step2__label">用户画像</span>
                <button class="page-test-persona-picker flow-test-step2__persona-picker" type="button" data-action="flow-test-next-open-persona-modal"></button>
              </div>

            <div class="flow-test-step2__field flow-test-step2__field--task">
              <span class="flow-test-step2__label">任务描述</span>
              <div
                class="page-test-task-input flow-test-step2__task-input"
                data-flow-test-next-task
                contenteditable="true"
                role="textbox"
                aria-multiline="true"
                data-placeholder="请描述用户在当前流程中需要完成的任务目标（如：完成下单流程、提交审批申请等）..."
              ></div>
            </div>

            <div class="flow-test-step2__field flow-test-step2__field--generate">
              <span class="flow-test-step2__label flow-test-step2__label--ghost">开始生成</span>
              <button class="page-test-generate-button flow-test-step2__generate-button" type="button" data-action="flow-test-next-generate"></button>
            </div>
          </div>

            <section class="page-test-results flow-test-step2__results" aria-labelledby="flow-test-next-results-title">
              <div class="page-test-results__header flow-test-step2__results-header">
                <h2 id="flow-test-next-results-title" class="page-test-results__title">生成结果</h2>
                <button class="page-test-results__regenerate" type="button" data-action="flow-test-next-regenerate" hidden></button>
              </div>
              <div class="flow-test-step2__results-content" data-flow-test-next-results></div>
            </section>
        </div>

        <div class="flow-test-stage__bottom-bar">
          <div class="flow-test-stage__bottom-inner">
            <div class="flow-test-stage__bottom-actions">
              <button class="button button--subtle flow-test-stage__bottom-button" type="button" data-action="flow-test-next-back">
                上一步
              </button>
              <button class="button button--primary flow-test-stage__bottom-button flow-test-stage__bottom-button--next" type="button" data-action="flow-test-next-save">
                保存结果
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function mountFlowTestPage() {
    if (!hasMountedOnce) {
      resetState();
      hasMountedOnce = true;
    }

    hydrateFlowTestDraft(readFlowTestDraft());

    pageRoot = document.querySelector("[data-flow-test-root]");
    canvasRoot = pageRoot?.querySelector("[data-flow-test-canvas]") || null;
    fileInput = pageRoot?.querySelector("[data-flow-test-file-input]") || null;

    if (!pageRoot || !canvasRoot || !fileInput) {
      return;
    }

    bindPageEvents();
    bindGlobalPaste();
    renderPage();
    focusSelectedNode();
  }

  function mountFlowTestNextPage() {
    nextPageRoot = document.querySelector("[data-flow-test-next-root]");
    if (!nextPageRoot) {
      return;
    }

    const historyRecord = consumePendingHistoryView("flow-test-next");
    if (historyRecord) {
      hydrateFlowTestViewFromHistory(historyRecord);
    }
    writeFlowTestDraft();
    bindFlowTestNextEvents();
    renderFlowTestNextPage();
  }

  function bindPageEvents() {
    const resetButton = pageRoot.querySelector('[data-action="flow-test-reset"]');
    const backButton = pageRoot.querySelector('[data-action="flow-test-back"]');
    const nextButton = pageRoot.querySelector('[data-action="flow-test-next"]');

    pageRoot.addEventListener("click", handlePageClick);
    pageRoot.addEventListener("input", handlePageInput);
    pageRoot.addEventListener("focusin", handlePageFocusIn);
    canvasRoot?.addEventListener("dragover", handleCanvasDragOver);
    canvasRoot?.addEventListener("dragleave", handleCanvasDragLeave);
    canvasRoot?.addEventListener("drop", handleCanvasDrop);

    fileInput?.addEventListener("change", (event) => {
      const [file] = Array.from(event.target.files || []);
      const targetNodeId = pendingUploadNodeId || state.selectedNodeId;

      if (file && targetNodeId) {
        void handleSelectedFile(targetNodeId, file);
      }

      event.target.value = "";
      pendingUploadNodeId = "";
    });

    resetButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetState();
      clearFlowTestDraft();
      renderPage();
      focusSelectedNode();
      showToast("流程上传布局已重置", "info");
    });

    backButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetState();
      clearFlowTestDraft();
      global.AppRouter?.setHashRoute("home");
    });

    nextButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      writeFlowTestDraft();
      global.AppRouter?.setHashRoute("flow-test-next");
    });
  }

  function bindFlowTestNextEvents() {
    const taskInput = nextPageRoot.querySelector("[data-flow-test-next-task]");
    const backButton = nextPageRoot.querySelector('[data-action="flow-test-next-back"]');
    const saveButton = nextPageRoot.querySelector('[data-action="flow-test-next-save"]');
    const personaButton = nextPageRoot.querySelector('[data-action="flow-test-next-open-persona-modal"]');
    const generateButton = nextPageRoot.querySelector('[data-action="flow-test-next-generate"]');
    const regenerateButton = nextPageRoot.querySelector('[data-action="flow-test-next-regenerate"]');

    taskInput?.addEventListener("input", (event) => {
      flowTestNextState.taskDescription = event.target.textContent || "";
      flowTestNextState.isSaved = false;
      renderFlowTestNextGenerateButton();
    });

    ["pointerdown", "mousedown", "click"].forEach((eventName) => {
      taskInput?.addEventListener(eventName, (event) => {
        event.stopPropagation();
        focusFlowTestNextTaskInputAtEnd(event.currentTarget);
      });
    });

    taskInput?.addEventListener("compositionstart", () => {
      isNextTaskComposing = true;
    });

    taskInput?.addEventListener("compositionend", (event) => {
      isNextTaskComposing = false;
      flowTestNextState.taskDescription = event.target.textContent || "";
      renderFlowTestNextGenerateButton();
    });

    taskInput?.addEventListener("blur", () => {
      renderFlowTestNextGenerateButton();
    });

    personaButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFlowTestNextPersonaPicker();
    });

    generateButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startFlowTestNextGeneration();
    });

    regenerateButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      askFlowTestNextRegeneration();
    });

    backButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      writeFlowTestDraft();
      global.AppRouter?.setHashRoute("flow-test");
    });

    saveButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFlowTestNextSaveDialog();
    });

    nextPageRoot.addEventListener("click", (event) => {
      const actionTarget = event.target.closest("[data-action]");
      if (!actionTarget) {
        return;
      }

      if (actionTarget.dataset.action === "flow-test-next-send-followup") {
        event.preventDefault();
        event.stopPropagation();
        sendFlowTestNextFollowUp();
        return;
      }

      if (actionTarget.dataset.action === "flow-test-next-delete-followup") {
        event.preventDefault();
        event.stopPropagation();
        deleteFlowTestNextFollowUp(Number(actionTarget.dataset.followupIndex));
        return;
      }

      if (actionTarget.dataset.action === "flow-test-next-regenerate") {
        event.preventDefault();
        event.stopPropagation();
        askFlowTestNextRegeneration();
      }
    });
  }

  function bindGlobalPaste() {
    if (isPasteBound) {
      return;
    }

    isPasteBound = true;
    document.addEventListener("paste", (event) => {
      if (document.body.dataset.route !== "flow-test") {
        return;
      }

      const targetNode = getSelectedUploadTarget();
      if (!targetNode) {
        showToast("当前没有可粘贴的空白页面，请先新增页面", "warning");
        return;
      }

      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => String(item.type || "").startsWith("image/"));
      const file = imageItem?.getAsFile();

      if (!file) {
        return;
      }

      event.preventDefault();
      void handleSelectedFile(targetNode.id, file);
    });
  }

  function handlePageClick(event) {
    if (event.target.closest("[data-flow-action-index]")) {
      return;
    }

    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      switch (actionTarget.dataset.action) {
        case "flow-test-add-node":
          insertEmptyNodeAfter(actionTarget.dataset.nodeId || "");
          return;
        case "flow-test-delete-node":
          removeNode(actionTarget.dataset.nodeId || "");
          return;
        case "flow-test-open-file":
          openFilePickerForNode(actionTarget.dataset.nodeId || "");
          return;
        case "flow-test-retry-upload":
          openFilePickerForNode(actionTarget.dataset.nodeId || "");
          return;
        case "flow-test-clear-image":
          clearNodeImage(actionTarget.dataset.nodeId || "");
          return;
        case "flow-test-close-preview":
          closeImagePreview();
          return;
        case "flow-test-reset":
          resetState();
          renderPage();
          focusSelectedNode();
          showToast("流程上传布局已重置", "info");
          return;
        case "flow-test-back":
          resetState();
          global.AppRouter?.setHashRoute("home");
          return;
        case "flow-test-next":
          global.AppRouter?.setHashRoute("flow-test-next");
          return;
        default:
          break;
      }
    }

    const nodeTarget = event.target.closest("[data-flow-node-id]");
    if (!nodeTarget) {
      return;
    }

    const nodeId = nodeTarget.dataset.flowNodeId || "";
    const node = getNodeById(nodeId);
    if (!node) {
      return;
    }

    if (node.status === "uploaded") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    state.selectedNodeId = nodeId;
    renderCanvas();
    focusSelectedNode();
  }

  function handlePageInput(event) {
    const input = event.target.closest("[data-flow-action-index]");
    if (!input) {
      return;
    }

    const index = Number(input.dataset.flowActionIndex);
    if (Number.isNaN(index)) {
      return;
    }

    state.actionTexts[index] = input.textContent || "";
  }

  function handlePageFocusIn(event) {
    const input = event.target.closest("[data-flow-action-index]");
    if (!input) {
      return;
    }

    event.stopPropagation();
  }

  function handleCanvasDragOver(event) {
    const nodeTarget = event.target.closest("[data-flow-node-id]");
    const node = nodeTarget ? getNodeById(nodeTarget.dataset.flowNodeId || "") : null;

    if (!node || node.status === "uploaded") {
      return;
    }

    event.preventDefault();
    state.selectedNodeId = node.id;
    state.nodes.forEach((item) => {
      item.isDragTarget = item.id === node.id;
    });
    renderCanvas();
  }

  function handleCanvasDragLeave(event) {
    const currentTarget = event.currentTarget;
    if (currentTarget?.contains(event.relatedTarget)) {
      return;
    }

    state.nodes.forEach((node) => {
      node.isDragTarget = false;
    });
    renderCanvas();
  }

  function handleCanvasDrop(event) {
    const nodeTarget = event.target.closest("[data-flow-node-id]");
    const node = nodeTarget ? getNodeById(nodeTarget.dataset.flowNodeId || "") : null;

    state.nodes.forEach((item) => {
      item.isDragTarget = false;
    });

    if (!node || node.status === "uploaded") {
      renderCanvas();
      return;
    }

    event.preventDefault();
    const [file] = Array.from(event.dataTransfer?.files || []);
    if (file) {
      void handleSelectedFile(node.id, file);
    } else {
      renderCanvas();
    }
  }

  function renderPage() {
    renderCanvas();
    renderPreviewModal();
  }

  function renderFlowTestNextPage() {
    if (!nextPageRoot) {
      return;
    }

    renderFlowTestNextToolbar();
    renderFlowTestNextGenerateButton();
    renderFlowTestNextResults();
    renderFlowTestNextBottomBar();
  }

  function renderFlowTestNextToolbar() {
    if (!nextPageRoot) {
      return;
    }

    const personaButton = nextPageRoot.querySelector(".flow-test-step2__persona-picker");
    const taskInput = nextPageRoot.querySelector("[data-flow-test-next-task]");
    const selectedPersona = getFlowTestNextSelectedPersona();
    const personaLabel = selectedPersona?.role || flowTestNextState.historyViewPersonaName || "";

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

    if (taskInput && taskInput !== document.activeElement && !isNextTaskComposing && taskInput.textContent !== flowTestNextState.taskDescription) {
      taskInput.textContent = flowTestNextState.taskDescription;
    }
  }

  function renderFlowTestNextGenerateButton() {
    if (!nextPageRoot) {
      return;
    }

    const button = nextPageRoot.querySelector(".flow-test-step2__generate-button");
    if (!button) {
      return;
    }

    const canGenerate = hasFlowTestNextRequiredFields() && !flowTestNextState.isGenerating;
    button.classList.toggle("is-ready", canGenerate);
    button.classList.toggle("is-incomplete", !canGenerate && !flowTestNextState.isGenerating);
    button.classList.toggle("is-loading", flowTestNextState.isGenerating);

    const nextMode = flowTestNextState.isGenerating ? "loading" : "idle";
    if (button.dataset.mode === nextMode) {
      return;
    }

    button.dataset.mode = nextMode;
    button.innerHTML = flowTestNextState.isGenerating
      ? '<span class="page-test-button-spinner" aria-hidden="true"></span><span>生成中</span>'
      : "<span>开始生成</span>";
  }

  function renderFlowTestNextResults() {
    if (!nextPageRoot) {
      return;
    }

    const resultsRoot = nextPageRoot.querySelector("[data-flow-test-next-results]");
    const resultsPanel = nextPageRoot.querySelector(".flow-test-step2__results");
    const regenerateButton = nextPageRoot.querySelector(".page-test-results__regenerate");
    if (!resultsRoot || !regenerateButton) {
      return;
    }

    resultsPanel?.classList.toggle("is-empty", !flowTestNextState.hasGenerated && !flowTestNextState.isGenerating);
    regenerateButton.hidden = !flowTestNextState.hasGenerated;
    regenerateButton.disabled = flowTestNextState.isGenerating;
    regenerateButton.innerHTML = `
      <span class="page-test-results__regenerate-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M20 11a8 8 0 1 0 2 5.3"></path>
          <path d="M20 5v6h-6"></path>
        </svg>
      </span>
      <span>重新生成</span>
    `;

    if (flowTestNextState.isGenerating) {
      resultsRoot.innerHTML = `
        <div class="page-test-results__loading">
          <span class="page-test-results__loading-spinner" aria-hidden="true"></span>
          <p class="page-test-results__loading-text">AI 正在分析流程可用性，请稍候...</p>
        </div>
      `;
      return;
    }

    if (!flowTestNextState.hasGenerated) {
      resultsRoot.innerHTML = `
        <div class="page-test-results__empty">
          <span class="page-test-results__empty-icon" aria-hidden="true">
            <svg viewBox="0 0 64 64" focusable="false">
              <path d="M19 42h26c6.1 0 11-4.7 11-10.5 0-5.4-4.1-9.8-9.4-10.4C45 14.8 39.3 10 32.5 10 24.8 10 18.4 16.1 17.8 23.9 12.2 24.7 8 29.3 8 34.9 8 38.8 10 42 19 42Z"></path>
              <path d="M32 44V27"></path>
              <path d="M25.5 33.5 32 27l6.5 6.5"></path>
            </svg>
          </span>
          <p class="page-test-results__empty-text">选择用户画像并填写任务描述后，这里会展示流程测试的可用性分析结果。</p>
        </div>
      `;
      return;
    }

    resultsRoot.innerHTML = `
      <div class="page-test-results__stack flow-test-step2__result-stack">
        ${flowTestNextState.resultSections.map(renderFlowTestNextResultSection).join("")}
        <section class="page-test-followup">
          <div class="page-test-followup__composer">
            <div
              class="page-test-followup__input"
              contenteditable="${flowTestNextState.isFollowUpLoading ? "false" : "true"}"
              role="textbox"
              aria-multiline="true"
              data-flow-test-next-followup-input
              data-placeholder="继续追问用户的具体问题、行为动机或困惑点（如：用户为什么会在这个流程节点停顿？）..."
            >${escapeHtml(flowTestNextState.followUpQuestion)}</div>
            <button class="button button--primary page-test-followup__send" type="button" data-action="flow-test-next-send-followup">
              ${
                flowTestNextState.isFollowUpLoading
                  ? '<span class="page-test-button-spinner" aria-hidden="true"></span><span>发送中</span>'
                  : "<span>发送</span>"
              }
            </button>
          </div>
          <div class="page-test-followup__history">
            ${flowTestNextState.followUps
              .map((item, index) => ({ item, index }))
              .sort((left, right) => Number(right.item.timestamp || 0) - Number(left.item.timestamp || 0))
              .map(({ item, index }) => renderFlowTestNextFollowUpCardItem(item, index))
              .join("")}
          </div>
        </section>
      </div>
    `;

    const followUpInput = nextPageRoot.querySelector("[data-flow-test-next-followup-input]");
    followUpInput?.addEventListener("input", (event) => {
      flowTestNextState.followUpQuestion = event.target.textContent || "";
    });
    ["pointerdown", "mousedown", "click"].forEach((eventName) => {
      followUpInput?.addEventListener(eventName, (event) => {
        event.stopPropagation();
        flowTestNextFollowUpFocusGuardUntil = Date.now() + 400;
        focusFlowTestNextFollowUpInputAtEnd(event.currentTarget);
      });
    });
    followUpInput?.addEventListener("focus", () => {
      flowTestNextFollowUpFocusGuardUntil = Date.now() + 400;
    });
    followUpInput?.addEventListener("blur", (event) => {
      if (flowTestNextState.isFollowUpLoading || isNextFollowUpComposing || Date.now() > flowTestNextFollowUpFocusGuardUntil) {
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

        focusFlowTestNextFollowUpInputAtEnd(event.currentTarget);
      });
    });
    followUpInput?.addEventListener("compositionstart", () => {
      isNextFollowUpComposing = true;
    });
    followUpInput?.addEventListener("compositionend", (event) => {
      isNextFollowUpComposing = false;
      flowTestNextState.followUpQuestion = event.target.textContent || "";
    });
  }

  function renderFlowTestNextBottomBar() {
    if (!nextPageRoot) {
      return;
    }

    const saveButton = nextPageRoot.querySelector('[data-action="flow-test-next-save"]');
    if (!saveButton) {
      return;
    }

    saveButton.classList.toggle("is-disabled", !flowTestNextState.hasGenerated || flowTestNextState.isGenerating);
  }

  function getFlowTestNextSelectedPersona() {
    return readPersonas().find((persona) => persona.id === flowTestNextState.selectedPersonaId) || null;
  }

  function hasFlowTestNextRequiredFields() {
    return Boolean(flowTestNextState.selectedPersonaId && flowTestNextState.taskDescription.trim());
  }

  function getFlowTestNextMissingRequiredActions() {
    const missing = [];

    if (!flowTestNextState.selectedPersonaId) {
      missing.push("选择用户画像");
    }

    if (!flowTestNextState.taskDescription.trim()) {
      missing.push("填写任务描述");
    }

    return missing;
  }

  function startFlowTestNextGeneration() {
    const taskInput = nextPageRoot?.querySelector("[data-flow-test-next-task]");
    if (taskInput) {
      flowTestNextState.taskDescription = taskInput.textContent || "";
    }

    if (!hasFlowTestNextRequiredFields()) {
      showToast(`请先${getFlowTestNextMissingRequiredActions().join("、")}`, "warning");
      renderFlowTestNextGenerateButton();
      return;
    }

    flowTestNextState.isGenerating = true;
    flowTestNextState.isSaved = false;
    flowTestNextState.followUps = [];
    flowTestNextState.followUpQuestion = "";
    flowTestNextState.isFollowUpLoading = false;
    renderFlowTestNextGenerateButton();
    renderFlowTestNextResults();
    renderFlowTestNextBottomBar();

    const requestId = ++flowTestNextGenerationRequestId;
    void requestFlowTestNextGeneration(requestId);
  }

  function askFlowTestNextRegeneration() {
    if (!flowTestNextState.hasGenerated || flowTestNextState.isGenerating) {
      return;
    }

    openFlowTestNextConfirmDialog({
      title: "重新生成结果",
      message: "确定要重新生成吗？当前结果将被覆盖，且无法恢复。",
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: startFlowTestNextGeneration,
    });
  }

  async function requestFlowTestNextGeneration(requestId) {
    const payload = {
      route: "flow-test",
      persona: getFlowTestNextSelectedPersona(),
      taskDescription: flowTestNextState.taskDescription.trim(),
      uploadedPageCount: state.nodes.filter((node) => node.status === "uploaded").length,
      actionDescriptions: state.actionTexts.filter((item) => item.trim()),
      uploadedNodes: state.nodes
        .filter((node) => node.status === "uploaded")
        .map((node) => ({
          id: node.id,
          imageName: node.image?.name || "",
          imageDataUrl: node.image?.dataUrl || "",
        })),
    };

    try {
      const sections = global.AppAI?.analyzePageTest
        ? await global.AppAI.analyzePageTest(payload, {
            fallback: () => buildFlowTestNextSections(),
          })
        : buildFlowTestNextSections();

      if (requestId !== flowTestNextGenerationRequestId) {
        return;
      }

      flowTestNextState.resultSections = Array.isArray(sections) ? sections : [];
      flowTestNextState.hasGenerated = true;
      flowTestNextState.isGenerating = false;
      flowTestNextState.followUps = [];
      flowTestNextState.followUpQuestion = "";
      renderFlowTestNextGenerateButton();
      renderFlowTestNextResults();
      renderFlowTestNextBottomBar();
    } catch (error) {
      if (requestId !== flowTestNextGenerationRequestId) {
        return;
      }

      flowTestNextState.resultSections = [];
      flowTestNextState.hasGenerated = false;
      flowTestNextState.isGenerating = false;
      renderFlowTestNextGenerateButton();
      renderFlowTestNextResults();
      renderFlowTestNextBottomBar();
      showToast("AI未连接成功", "error");
    }
  }

  function buildFlowTestNextSections() {
    const personaName = getFlowTestNextSelectedPersona()?.role || "目标用户";
    const task = flowTestNextState.taskDescription.trim();
    const actionCount = state.actionTexts.filter((item) => item.trim()).length;
    const pageCount = state.nodes.filter((node) => node.status === "uploaded").length || 1;
    const duration = `${(pageCount * 1.2 + Math.max(actionCount, 1) * 0.6).toFixed(1)} 分钟`;
    const clicks = `${Math.max(actionCount + 1, pageCount)} 步`;
    const backtracks = `${Math.max(0, pageCount - 2)} 次`;

    return [
      {
        theme: "completion",
        title: "1. 任务完成度",
        icon: createFlowTestSectionIcon("completion"),
        badge: "整体可完成",
        body: [
          `${personaName} 能够顺着当前流程完成“${task}”相关任务，关键节点之间的跳转关系基本清晰。`,
          `当前共涉及 ${pageCount} 个流程页面、${Math.max(actionCount, 1)} 个关键操作说明，整体链路没有明显断点。`,
        ],
        notes: ["建议继续补足空白页面或模糊操作说明，避免用户在跨页跳转时出现理解停顿。"],
      },
      {
        theme: "efficiency",
        title: "2. 效率与流畅度",
        icon: createFlowTestSectionIcon("efficiency"),
        body: [
          "流程中的操作提示较集中，用户能比较快地判断下一步要去哪里。",
          "如果页面之间的承接语义再统一一些，整体切换效率还可以继续提升。",
        ],
        metrics: [
          { value: duration, label: "完成时长" },
          { value: backtracks, label: "回退次数" },
        ],
        notes: ["流程评价：当前链路连续性较好，适合作为完整流程测试的基础版本。"],
      },
      {
        theme: "cognition",
        title: "3. 理解与认知匹配",
        icon: createFlowTestSectionIcon("cognition"),
        badge: "理解成本较低",
        body: [
          `${personaName} 对流程的目标理解较快，尤其当相邻页面之间的操作说明足够明确时，几乎不需要额外猜测。`,
          "如果某个节点没有填写操作说明，用户会更依赖页面视觉判断，理解负担会略有提升。",
        ],
        notes: ["建议让每条操作说明尽量贴近真实点击动作，减少抽象描述。"],
      },
      {
        theme: "errors",
        title: "4. 错误与容错性",
        icon: createFlowTestSectionIcon("errors"),
        body: [
          "当前流程的主要风险点在于节点过多时，用户可能忽略其中一条连接关系或误解某一步的执行对象。",
          "如果流程结果后续支持重新编辑节点顺序、补充说明或高亮关键步骤，容错体验会更好。",
        ],
        notes: ["建议在后续版本补充节点异常提示、步骤校验和跨页回退说明。"],
      },
      {
        theme: "satisfaction",
        title: "5. 主观体验与满意度",
        icon: createFlowTestSectionIcon("satisfaction"),
        badge: "流程感知清晰",
        body: [
          `${personaName} 会觉得当前流程结构是有条理的，尤其适合用来理解完整任务的先后顺序。`,
          "当节点数量继续增加时，建议用更明显的视觉分组去承接不同阶段，否则满意度会随着认知负担上升而下降。",
        ],
        notes: ["整体评价：当前流程编排清楚，适合继续进入保存和复盘环节。"],
      },
    ];
  }

  function renderFlowTestNextFollowUpItem(item) {
    return `
      <article class="page-test-followup__item">
        <p class="page-test-followup__question">追问：${escapeHtml(item.question)}</p>
        <p class="page-test-followup__answer">${escapeHtml(item.answer)}</p>
      </article>
    `;
  }

  function renderFlowTestNextFollowUpCardItem(item, index) {
    return `
      <article class="page-test-followup__item">
        <button class="page-test-followup__delete" type="button" data-action="flow-test-next-delete-followup" data-followup-index="${index}" aria-label="删除这条追问">
          <span aria-hidden="true">×</span>
        </button>
        <p class="page-test-followup__question">追问：${escapeHtml(item.question)}</p>
        <p class="page-test-followup__answer">${escapeHtml(item.answer)}</p>
      </article>
    `;
  }

  function deleteFlowTestNextFollowUp(index) {
    if (!Number.isInteger(index) || index < 0 || index >= flowTestNextState.followUps.length) {
      return;
    }

    flowTestNextState.followUps.splice(index, 1);
    flowTestNextState.isSaved = false;
    renderFlowTestNextResults();
    renderFlowTestNextBottomBar();
  }

  async function sendFlowTestNextFollowUp() {
    if (!flowTestNextState.hasGenerated || flowTestNextState.isFollowUpLoading) {
      return;
    }

    const followupInput = nextPageRoot?.querySelector("[data-flow-test-next-followup-input]");
    if (followupInput) {
      flowTestNextState.followUpQuestion = followupInput.textContent || "";
    }

    if (!flowTestNextState.followUpQuestion.trim()) {
      showToast("请输入追问内容", "error");
      return;
    }

    if (!global.navigator.onLine) {
      showToast("网络异常，请检查网络后重试", "error");
      return;
    }

    const question = flowTestNextState.followUpQuestion.trim();
    flowTestNextState.isFollowUpLoading = true;
    renderFlowTestNextResults();
    const requestId = ++flowTestNextFollowUpRequestId;

    const payload = {
      route: "flow-test",
      question,
      persona: getFlowTestNextSelectedPersona(),
      taskDescription: flowTestNextState.taskDescription.trim(),
      resultSections: flowTestNextState.resultSections,
      uploadedPageCount: state.nodes.filter((node) => node.status === "uploaded").length,
      actionDescriptions: state.actionTexts.filter((item) => item.trim()),
    };

    try {
      const answer = global.AppAI?.followUpPageTest
        ? await global.AppAI.followUpPageTest(payload, {
            fallback: () => buildFlowTestNextFollowUpAnswer(question),
          })
        : buildFlowTestNextFollowUpAnswer(question);

      if (requestId !== flowTestNextFollowUpRequestId) {
        return;
      }

      flowTestNextState.followUps.push({
        id: `flow-followup-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        question,
        answer,
      });
      flowTestNextState.followUpQuestion = "";
      flowTestNextState.isFollowUpLoading = false;
      flowTestNextState.isSaved = false;
      renderFlowTestNextResults();
      renderFlowTestNextBottomBar();
    } catch (error) {
      if (requestId !== flowTestNextFollowUpRequestId) {
        return;
      }

      flowTestNextState.isFollowUpLoading = false;
      renderFlowTestNextResults();
      showToast("AI未连接成功", "error");
    }
  }

  function buildFlowTestNextFollowUpAnswer(question) {
    const personaName = getFlowTestNextSelectedPersona()?.role || "该用户";
    const stepCount = state.nodes.filter((node) => node.status === "uploaded").length || 1;
    return `针对“${question}”这个追问，${personaName} 在当前 ${stepCount} 步流程里更容易受节点承接关系和操作说明清晰度影响。建议重点观察用户是在进入下一页前产生迟疑，还是在页面切换后需要重新理解目标；如果停顿集中出现在某一段，通常说明该段的操作描述还不够具体。`;
  }

  function focusFlowTestNextFollowUpInputAtEnd(target) {
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

  function createFlowTestSectionIcon(type) {
    const icons = {
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

    return icons[type] || icons.completion;
  }

  function renderFlowTestNextResultSection(section) {
    const iconMarkup = section.icon || createFlowTestSectionIcon(section.theme);
    const body = section.body.map((paragraph) => `<p class="page-test-result-card__paragraph">${escapeHtml(paragraph)}</p>`).join("");
    const notes = section.notes?.length
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
        <div class="page-test-result-card__body">${body}</div>
        ${notes}
      </article>
    `;
  }

  function openFlowTestNextPersonaPicker() {
    const personas = readPersonas();
    const listMarkup = personas.length
      ? personas
          .map(
            (persona) => `
              <button class="page-test-persona-option${persona.id === flowTestNextState.selectedPersonaId ? " is-active" : ""}" type="button" data-flow-test-next-persona-id="${persona.id}">
                <strong>${escapeHtml(persona.role)}</strong>
                <span>${escapeHtml(persona.description)}</span>
              </button>
            `,
          )
          .join("")
      : `
          <div class="page-test-dialog__empty-block">
            <p>暂无用户画像，请先新建用户画像。</p>
            <button class="button button--primary page-test-dialog__button" type="button" data-action="flow-test-next-inline-persona-create">新建用户画像</button>
          </div>
        `;

    const actions = personas.length
      ? `
          <button class="button button--subtle page-test-dialog__button" type="button" data-flow-test-dialog-close>取消</button>
          <button class="button button--primary page-test-dialog__button" type="button" data-action="flow-test-next-inline-persona-create">新建用户画像</button>
        `
      : `<button class="button button--subtle page-test-dialog__button" type="button" data-flow-test-dialog-close>关闭</button>`;

    openFlowModal(
      createFlowDialogShell(
        "用户画像管理",
        `<div class="page-test-persona-list">${listMarkup}</div>`,
        actions,
        "page-test-dialog__panel--persona",
      ),
      (modalElement) => {
        bindFlowDialogClose(modalElement);

        modalElement.querySelectorAll("[data-flow-test-next-persona-id]").forEach((button) => {
          button.addEventListener("click", () => {
            flowTestNextState.selectedPersonaId = button.dataset.flowTestNextPersonaId || "";
            flowTestNextState.isSaved = false;
            flowTestNextState.hasGenerated = false;
            closeFlowModal();
            renderFlowTestNextToolbar();
            renderFlowTestNextGenerateButton();
            renderFlowTestNextResults();
            renderFlowTestNextBottomBar();
          });
        });

        modalElement.querySelectorAll('[data-action="flow-test-next-inline-persona-create"]').forEach((button) => {
          button.addEventListener("click", openFlowTestNextInlinePersonaCreate);
        });
      },
    );
  }

  function openFlowTestNextInlinePersonaCreate() {
    openFlowModal(
      `
        <div class="persona-modal persona-modal--page-test" role="dialog" aria-modal="true" aria-labelledby="flow-test-next-persona-create-title">
          <button class="persona-modal__backdrop" type="button" data-flow-test-dialog-close aria-label="关闭弹窗"></button>
          <div class="persona-modal__dialog">
            <div class="persona-modal__header">
              <h2 id="flow-test-next-persona-create-title" class="persona-modal__title">新增用户画像</h2>
              <button class="persona-modal__close" type="button" data-flow-test-dialog-close aria-label="关闭弹窗">
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
                <input class="persona-modal__input" type="text" maxlength="20" placeholder="请输入用户类型" data-flow-test-next-persona-role>
                <span class="persona-modal__error is-hidden" data-flow-test-next-persona-error="role"></span>
              </label>
              <label class="persona-modal__field persona-modal__field--textarea">
                <span class="persona-modal__label">用户详细特征</span>
                <textarea class="persona-modal__textarea" placeholder="请输入用户的年龄、背景、技术能力、性格、任务目标等详细信息" data-flow-test-next-persona-description></textarea>
                <span class="persona-modal__error is-hidden" data-flow-test-next-persona-error="description"></span>
              </label>
              <button class="button button--primary persona-modal__submit" type="button" data-flow-test-next-persona-submit>确定创建</button>
            </div>
          </div>
        </div>
      `,
      (modalElement) => {
        bindFlowDialogClose(modalElement);
        const roleInput = modalElement.querySelector("[data-flow-test-next-persona-role]");
        const descriptionInput = modalElement.querySelector("[data-flow-test-next-persona-description]");
        const roleError = modalElement.querySelector('[data-flow-test-next-persona-error="role"]');
        const descriptionError = modalElement.querySelector('[data-flow-test-next-persona-error="description"]');
        const submitButton = modalElement.querySelector("[data-flow-test-next-persona-submit]");

        submitButton?.addEventListener("click", () => {
          const role = String(roleInput?.value || "").trim();
          const description = String(descriptionInput?.value || "").trim();
          const errors = {};

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

          if (roleError) {
            roleError.textContent = errors.role || "";
            roleError.classList.toggle("is-hidden", !errors.role);
          }
          if (descriptionError) {
            descriptionError.textContent = errors.description || "";
            descriptionError.classList.toggle("is-hidden", !errors.description);
          }

          if (errors.role || errors.description) {
            (errors.role ? roleInput : descriptionInput)?.focus();
            return;
          }

          const timestamp = Date.now();
          const persona = {
            id: `persona-${timestamp}`,
            role,
            description,
            createdAt: timestamp,
          };

          writePersonas([...readPersonas(), persona]);
          flowTestNextState.selectedPersonaId = persona.id;
          flowTestNextState.isSaved = false;
          flowTestNextState.hasGenerated = false;
          closeFlowModal();
          renderFlowTestNextToolbar();
          renderFlowTestNextGenerateButton();
          renderFlowTestNextResults();
          renderFlowTestNextBottomBar();
          showToast("新建用户画像成功", "success");
        });

        global.requestAnimationFrame(() => roleInput?.focus());
      },
    );
  }

  function openFlowTestNextSaveDialog() {
    if (!hasFlowTestNextRequiredFields()) {
      showToast("请先选择用户画像并填写任务描述", "warning");
      return;
    }

    openFlowModal(
      createFlowDialogShell(
        "保存测试结果",
        `
          <label class="page-test-dialog__field">
            <span class="page-test-dialog__field-label">任务名称</span>
            <input class="page-test-dialog__input" type="text" maxlength="30" placeholder="请输入任务名称" data-flow-test-next-save-name>
            <span class="page-test-dialog__error is-hidden" data-flow-test-next-save-error></span>
          </label>
        `,
        `
          <button class="button button--subtle page-test-dialog__button" type="button" data-flow-test-dialog-close>取消</button>
          <button class="button button--primary page-test-dialog__button" type="button" data-flow-test-next-save-confirm>确定</button>
        `,
      ),
      (modalElement) => {
        bindFlowDialogClose(modalElement);
        const input = modalElement.querySelector("[data-flow-test-next-save-name]");
        const errorNode = modalElement.querySelector("[data-flow-test-next-save-error]");
        const confirmButton = modalElement.querySelector("[data-flow-test-next-save-confirm]");

        confirmButton?.addEventListener("click", () => {
          const taskName = String(input?.value || "").trim();
          const errorMessage = validateFlowTestNextTaskName(taskName);

          if (errorNode) {
            errorNode.textContent = errorMessage;
            errorNode.classList.toggle("is-hidden", !errorMessage);
          }

          if (errorMessage) {
            return;
          }

          saveFlowTestNextHistoryRecord(taskName);
          flowTestNextState.isSaved = true;
          clearFlowTestDraft();
          closeFlowModal();
          showToast("保存成功", "success");
          global.setTimeout(() => {
            global.AppRouter?.setHashRoute("home");
          }, 700);
        });

        global.requestAnimationFrame(() => input?.focus());
      },
    );
  }

  function openFlowTestNextConfirmDialog(options) {
    openFlowModal(
      createFlowDialogShell(
        options.title,
        `<p class="page-test-dialog__message">${escapeHtml(options.message)}</p>`,
        `
          <button class="button button--subtle page-test-dialog__button" type="button" data-flow-test-dialog-close>${options.cancelText || "取消"}</button>
          <button class="button ${options.confirmTone === "danger" ? "page-test-dialog__button page-test-dialog__button--danger" : "button--primary page-test-dialog__button"}" type="button" data-flow-test-dialog-confirm>${options.confirmText || "确定"}</button>
        `,
      ),
      (modalElement) => {
        bindFlowDialogClose(modalElement);
        modalElement.querySelector("[data-flow-test-dialog-confirm]")?.addEventListener("click", () => {
          closeFlowModal();
          options.onConfirm?.();
        });
      },
    );
  }

  function validateFlowTestNextTaskName(taskName) {
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

  function saveFlowTestNextHistoryRecord(taskName) {
    const timestamp = Date.now();
    const records = readHistoryRecords();
    records.push({
      id: `history-${timestamp}`,
      date: formatDateTime(timestamp),
      timestamp,
      taskName,
      personaId: flowTestNextState.selectedPersonaId || "",
      userType: getFlowTestNextSelectedPersona()?.role || "",
      taskDescription: flowTestNextState.taskDescription.trim(),
      resultSections: flowTestNextState.resultSections,
      followUps: flowTestNextState.followUps,
      screenshot: "",
      testType: "flow-test",
      actionDescriptions: state.actionTexts.filter((item) => item.trim()),
      flowDraft: buildFlowTestDraft(),
      uploadedNodes: state.nodes
        .filter((node) => node.status === "uploaded")
        .map((node) => ({
          id: node.id,
          imageName: node.image?.name || "",
          imageDataUrl: node.image?.dataUrl || "",
        })),
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

  function createFlowDialogShell(title, content, actions, sizeClass) {
    return `
      <div class="page-test-dialog" role="dialog" aria-modal="true">
        <button class="page-test-dialog__backdrop" type="button" data-flow-test-dialog-close aria-label="关闭弹窗"></button>
        <div class="page-test-dialog__panel ${sizeClass || ""}">
          <div class="page-test-dialog__header">
            <h2 class="page-test-dialog__title">${title}</h2>
            <button class="page-test-dialog__close" type="button" data-flow-test-dialog-close aria-label="关闭弹窗">
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

  function openFlowModal(markup, onMount) {
    closeFlowModal();
    if (!modalRoot) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = markup.trim();
    const modalElement = wrapper.firstElementChild;
    if (!modalElement) {
      return;
    }

    modalRoot.appendChild(modalElement);
    onMount?.(modalElement);
  }

  function bindFlowDialogClose(modalElement) {
    modalElement.querySelectorAll("[data-flow-test-dialog-close]").forEach((button) => {
      button.addEventListener("click", closeFlowModal);
    });
  }

  function closeFlowModal() {
    modalRoot?.replaceChildren();
  }

  function focusFlowTestNextTaskInputAtEnd(target) {
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

  function renderCanvas() {
    if (!canvasRoot) {
      return;
    }

    const focusedConnector = getFocusedConnectorState();

    canvasRoot.innerHTML = `
      <div class="flow-test-track">
        ${state.nodes
          .map((node, index) => {
            const nodeMarkup = renderNode(node);
            if (index === state.nodes.length - 1) {
              return nodeMarkup;
            }

            return `${nodeMarkup}${renderConnector(index)}`;
          })
          .join("")}
      </div>
    `;

    bindConnectorEditors();
    restoreFocusedConnector(focusedConnector);
  }

  function renderNode(node) {
    const classes = [
      "flow-test-node",
      `flow-test-node--${node.status}`,
      node.status !== "uploaded" && state.selectedNodeId === node.id ? "is-selected" : "",
      node.isDragTarget ? "is-drag-target" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <article class="flow-test-node-shell">
        <div class="${classes}" data-flow-node-id="${node.id}" tabindex="${node.status === "uploaded" ? "-1" : "0"}">
          ${renderNodeBody(node)}
        </div>
        ${renderNodeFooter(node)}
      </article>
    `;
  }

  function renderNodeBody(node) {
    if (node.status === "loading") {
      return `
        <div class="flow-test-node__state flow-test-node__state--loading">
          <span class="flow-test-node__spinner" aria-hidden="true"></span>
          <p class="flow-test-node__state-title">图片上传中...</p>
          <p class="flow-test-node__state-text">请稍候，系统正在处理当前流程页面。</p>
        </div>
      `;
    }

    if (node.status === "error") {
      return `
        <div class="flow-test-node__state flow-test-node__state--error">
          <span class="flow-test-node__error-icon" aria-hidden="true">!</span>
          <p class="flow-test-node__state-title">上传失败</p>
          <p class="flow-test-node__state-text">${escapeHtml(node.errorMessage || "请重新上传图片")}</p>
          <button class="button button--subtle flow-test-node__retry" type="button" data-action="flow-test-retry-upload" data-node-id="${node.id}">
            重新上传
          </button>
        </div>
      `;
    }

    if (node.status === "uploaded" && node.image) {
      return `
        <img class="flow-test-node__image" src="${node.image.dataUrl}" alt="流程页面预览">
        <button class="flow-test-node__icon-button flow-test-node__icon-button--danger flow-test-node__icon-button--persistent" type="button" data-action="flow-test-clear-image" data-node-id="${node.id}" aria-label="删除当前图片">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M6 6l12 12"></path>
            <path d="M18 6L6 18"></path>
          </svg>
        </button>
      `;
    }

    return `
      <div class="flow-test-node__state flow-test-node__state--empty">
        <span class="flow-test-node__upload-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" focusable="false">
            <path d="M20 39a10 10 0 0 1 1.6-19.87A14 14 0 0 1 48 22a9 9 0 1 1 1 17H20Z"></path>
            <path d="M32 40V23"></path>
            <path d="M25 30l7-7 7 7"></path>
          </svg>
        </span>
        <p class="flow-test-node__state-title">拖拽、粘贴或点击上传页面截图</p>
        <p class="flow-test-node__state-text">支持 PNG、JPG 格式</p>
        <div class="flow-test-node__state-footer">
          <span>拖拽文件</span>
          <span aria-hidden="true">·</span>
          <span>Ctrl+V 粘贴</span>
          <span aria-hidden="true">·</span>
          <span>点击选择</span>
        </div>
        <button class="flow-test-node__cover-button" type="button" data-action="flow-test-open-file" data-node-id="${node.id}" aria-label="上传流程页面"></button>
      </div>
    `;
  }

  function renderNodeFooter(node) {
    if (node.status !== "uploaded") {
      return `<div class="flow-test-node-shell__footer"></div>`;
    }

    return `
      <div class="flow-test-node-shell__footer">
        <button class="button button--subtle flow-test-node__add-button" type="button" data-action="flow-test-add-node" data-node-id="${node.id}">
          增加页面
        </button>
      </div>
    `;
  }

  function renderConnector(index) {
    return `
      <section class="flow-test-connector">
        <div
          class="flow-test-connector__input"
          data-flow-action-index="${index}"
          contenteditable="true"
          role="textbox"
          aria-multiline="true"
          spellcheck="false"
          placeholder="请输入点击/操作的模块内容"
          data-placeholder="请输入点击/操作的模块内容"
        >${escapeHtml(state.actionTexts[index] || "")}</div>
        <div class="flow-test-connector__line" aria-hidden="true">
          <span class="flow-test-connector__arrow"></span>
        </div>
      </section>
    `;
  }

  function renderPreviewModal() {
    if (!modalRoot) {
      return;
    }

    modalRoot.replaceChildren();

    if (!state.viewerImage) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div class="flow-test-modal">
        <button class="flow-test-modal__backdrop" type="button" data-action="flow-test-close-preview" aria-label="关闭预览"></button>
        <div class="flow-test-modal__dialog">
          <button class="flow-test-modal__close" type="button" data-action="flow-test-close-preview" aria-label="关闭预览">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M6 6l12 12"></path>
              <path d="M18 6L6 18"></path>
            </svg>
          </button>
          <img class="flow-test-modal__image" src="${state.viewerImage}" alt="流程页面大图预览">
        </div>
      </div>
    `.trim();

    const modal = wrapper.firstElementChild;
    if (!modal) {
      return;
    }

    modalRoot.appendChild(modal);
    modal.querySelectorAll('[data-action="flow-test-close-preview"]').forEach((button) => {
      button.addEventListener("click", closeImagePreview);
    });
  }

  function openFilePickerForNode(nodeId) {
    const node = getNodeById(nodeId);
    if (!node || node.status === "uploaded") {
      return;
    }

    pendingUploadNodeId = nodeId;
    state.selectedNodeId = nodeId;
    renderCanvas();
    fileInput?.click();
  }

  async function handleSelectedFile(nodeId, file) {
    const node = getNodeById(nodeId);
    if (!node) {
      return;
    }

    const validationMessage = validateFile(file);
    if (validationMessage) {
      node.status = "error";
      node.errorMessage = validationMessage;
      state.selectedNodeId = node.id;
      renderCanvas();
      showToast(validationMessage, "error");
      return;
    }

    node.status = "loading";
    node.errorMessage = "";
    state.selectedNodeId = node.id;
    renderCanvas();

    try {
      const imageData = await readImageFile(file);
      node.status = "uploaded";
      node.image = imageData;
      node.errorMessage = "";
      queueAutoAppendIfNeeded(node.id);
      selectLastAvailableEmptyNode();
      renderCanvas();
    } catch (error) {
      node.status = "error";
      node.errorMessage = "上传失败，请检查文件格式及网络状态后重试";
      state.selectedNodeId = node.id;
      renderCanvas();
      showToast(node.errorMessage, "error");
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

  function optimizeImageAsset(file, image, sourceDataUrl) {
    return new Promise((resolve, reject) => {
      const originalWidth = Number(image.width) || 0;
      const originalHeight = Number(image.height) || 0;

      if (!originalWidth || !originalHeight) {
        resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: sourceDataUrl,
          width: originalWidth,
          height: originalHeight,
        });
        return;
      }

      const maxLongSide = 1440;
      const longestSide = Math.max(originalWidth, originalHeight);
      const scale = longestSide > maxLongSide ? maxLongSide / longestSide : 1;
      const targetWidth = Math.max(1, Math.round(originalWidth * scale));
      const targetHeight = Math.max(1, Math.round(originalHeight * scale));

      if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
        resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: sourceDataUrl,
          width: originalWidth,
          height: originalHeight,
        });
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: sourceDataUrl,
          width: originalWidth,
          height: originalHeight,
        });
        return;
      }

      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl: sourceDataUrl,
              width: originalWidth,
              height: originalHeight,
            });
            return;
          }

          const compressedReader = new FileReader();
          compressedReader.onerror = () => reject(new Error("compress-read-error"));
          compressedReader.onload = () =>
            resolve({
              name: file.name,
              type: blob.type || "image/jpeg",
              size: blob.size,
              dataUrl: String(compressedReader.result || sourceDataUrl),
              width: targetWidth,
              height: targetHeight,
            });
          compressedReader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.82
      );
    });
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("read-error"));
      reader.onload = () => {
        const image = new Image();
        image.onload = () => optimizeImageAsset(file, image, String(reader.result || "")).then(resolve).catch(reject);
        image.onerror = () => reject(new Error("image-error"));
        image.src = String(reader.result || "");
      };

      reader.readAsDataURL(file);
    });
  }

  function queueAutoAppendIfNeeded(nodeId) {
    global.clearTimeout(autoAppendTimer);

    const index = getNodeIndex(nodeId);
    if (index < 0 || index !== state.nodes.length - 1) {
      return;
    }

    autoAppendTimer = global.setTimeout(() => {
      const latestNode = getNodeById(nodeId);
      if (!latestNode || latestNode.status !== "uploaded") {
        return;
      }

      appendEmptyNode();
      renderCanvas();
      focusSelectedNode();
    }, 160);
  }

  function appendEmptyNode() {
    const node = createNode(createNodeId(), { isDefault: false });
    state.nodes.push(node);
    state.actionTexts.push("");
    state.selectedNodeId = node.id;
  }

  function insertEmptyNodeAfter(nodeId) {
    const index = getNodeIndex(nodeId);
    if (index < 0) {
      return;
    }

    const newNode = createNode(createNodeId(), { isDefault: false });
    const preservedText = state.actionTexts[index] || "";

    state.nodes.splice(index + 1, 0, newNode);

    if (index >= state.actionTexts.length) {
      state.actionTexts.push("");
    } else {
      state.actionTexts.splice(index, 1, "", preservedText);
    }

    state.selectedNodeId = newNode.id;
    renderCanvas();
    focusSelectedNode();
  }

  function removeNode(nodeId) {
    const index = getNodeIndex(nodeId);
    const node = getNodeById(nodeId);
    if (!node || index < 0 || node.isDefault) {
      return;
    }

    state.nodes.splice(index, 1);

    if (state.nodes.length <= 1) {
      state.actionTexts = [];
    } else if (index === state.nodes.length) {
      state.actionTexts.splice(index - 1, 1);
    } else {
      const mergedText = state.actionTexts[index - 1] || state.actionTexts[index] || "";
      state.actionTexts.splice(index - 1, 2, mergedText);
    }

    selectLastAvailableEmptyNode();
    renderCanvas();
  }

  function clearNodeImage(nodeId) {
    const node = getNodeById(nodeId);
    if (!node || node.status !== "uploaded") {
      return;
    }

    node.status = "empty";
    node.image = null;
    node.errorMessage = "";
    node.isDragTarget = false;
    state.selectedNodeId = node.id;

    if (!hasTrailingEmptyNode()) {
      appendEmptyNode();
    }

    renderCanvas();
    focusSelectedNode();
    showToast("已删除当前页面图片", "info");
  }

  function hasTrailingEmptyNode() {
    const lastNode = state.nodes[state.nodes.length - 1];
    return Boolean(lastNode && lastNode.status !== "uploaded");
  }

  function selectLastAvailableEmptyNode() {
    const lastAvailable = [...state.nodes].reverse().find((node) => node.status !== "uploaded");
    state.selectedNodeId = lastAvailable?.id || "";
  }

  function getSelectedUploadTarget() {
    const selectedNode = getSelectedNode();
    if (selectedNode && selectedNode.status !== "uploaded") {
      return selectedNode;
    }

    return state.nodes.find((node) => node.status !== "uploaded") || null;
  }

  function focusSelectedNode() {
    const selectedNode = pageRoot?.querySelector(`[data-flow-node-id="${state.selectedNodeId}"]`);
    global.requestAnimationFrame(() => {
      selectedNode?.focus();
    });
  }

  function openImagePreview(nodeId) {
    const node = getNodeById(nodeId);
    if (!node?.image?.dataUrl) {
      return;
    }

    state.viewerImage = node.image.dataUrl;
    renderPreviewModal();
  }

  function closeImagePreview() {
    state.viewerImage = null;
    renderPreviewModal();
  }

  function showToast(message, tone) {
    if (!toastRoot) {
      return;
    }

    const toast = document.createElement("div");
    toast.className = `flow-test-toast flow-test-toast--${tone || "info"}`;
    toast.textContent = message;
    toastRoot.replaceChildren(toast);

    global.clearTimeout(showToast.timer);
    showToast.timer = global.setTimeout(() => {
      if (toast.isConnected) {
        toast.remove();
      }
    }, 2600);
  }

  function getFocusedConnectorState() {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) {
      return null;
    }

    if (!activeElement.matches("[data-flow-action-index]")) {
      return null;
    }

      return {
        index: Number(activeElement.dataset.flowActionIndex),
      textLength: activeElement.textContent?.length || 0,
      scrollTop: activeElement.scrollTop,
    };
  }

  function restoreFocusedConnector(focusedConnector) {
    if (!focusedConnector || Number.isNaN(focusedConnector.index)) {
      return;
    }

    const nextInput = canvasRoot?.querySelector(`[data-flow-action-index="${focusedConnector.index}"]`);
    if (!(nextInput instanceof HTMLElement)) {
      return;
    }

    global.requestAnimationFrame(() => {
      nextInput.focus();
      nextInput.scrollTop = focusedConnector.scrollTop;
      placeCaretAtEnd(nextInput, focusedConnector.textLength);
    });
  }

  function bindConnectorEditors() {
    if (!canvasRoot) {
      return;
    }

    canvasRoot.querySelectorAll("[data-flow-action-index]").forEach((editor) => {
      if (editor.dataset.focusGuardBound === "true") {
        return;
      }

      const keepFocus = (event) => {
        event.stopPropagation();
        global.requestAnimationFrame(() => {
          editor.focus();
        });
      };

      const stopOnly = (event) => {
        event.stopPropagation();
      };

      editor.addEventListener("pointerdown", keepFocus);
      editor.addEventListener("mousedown", keepFocus);
      editor.addEventListener("click", keepFocus);
      editor.addEventListener("keydown", stopOnly);
      editor.addEventListener("keyup", stopOnly);

      editor.dataset.focusGuardBound = "true";
    });
  }

  function placeCaretAtEnd(target, textLength) {
    const selection = global.getSelection?.();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  global.FlowTestPage = {
    createFlowTestNextPage,
    createFlowTestPage,
    mountFlowTestPage,
    mountFlowTestNextPage,
  };
})(window);
