(function attachHistoryPage(global) {
  const STORAGE_KEY = "ai-usability-history-records";
  const HISTORY_VIEW_STORAGE_KEY = "ai-usability-history-view-record";

  let pendingDeleteId = null;
  let pageRoot = null;

  function readHistoryRecords() {
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

  function writeHistoryRecords(records) {
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function refreshPage() {
    global.AppRouter?.setHashRoute("history");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getRecordTimestamp(record) {
    if (typeof record.timestamp === "number" && Number.isFinite(record.timestamp)) {
      return record.timestamp;
    }

    const parsed = Date.parse(record.date || "");
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function sortRecords(records) {
    return [...records].sort((left, right) => getRecordTimestamp(right) - getRecordTimestamp(left));
  }

  function createDeleteBubble(recordId) {
    return `
      <div class="history-directory__delete-bubble" role="alertdialog" aria-live="polite">
        <p class="history-directory__delete-text">确认删除这条历史记录吗？</p>
        <div class="history-directory__delete-actions">
          <button
            class="button history-directory__delete-confirm"
            type="button"
            data-action="history-delete-confirm-v1"
            data-history-id="${recordId}"
          >
            确认删除
          </button>
          <button
            class="button button--subtle history-directory__delete-cancel"
            type="button"
            data-action="history-delete-cancel-v1"
          >
            取消
          </button>
        </div>
      </div>
    `;
  }

  function createRow(record) {
    const isDeletePending = pendingDeleteId === record.id;
    const targetRoute = record.testType === "flow-test" ? "flow-test-next" : "page-test";

    return `
      <tr class="history-directory__row">
        <td class="history-directory__cell history-directory__cell--date">${escapeHtml(record.date)}</td>
        <td class="history-directory__cell history-directory__cell--task-name">${escapeHtml(record.taskName)}</td>
        <td class="history-directory__cell history-directory__cell--user-type">${escapeHtml(record.userType)}</td>
        <td class="history-directory__cell history-directory__cell--task-description">${escapeHtml(record.taskDescription)}</td>
        <td class="history-directory__cell history-directory__cell--actions">
          <div class="history-directory__actions-wrap">
            <div class="history-directory__actions">
              <button
                class="button button--subtle history-directory__action-button history-directory__action-button--view"
                type="button"
                data-action="history-view-request-v1"
                data-history-id="${record.id}"
                data-history-route="${targetRoute}"
              >
                查看
              </button>
              <button
                class="button button--subtle history-directory__action-button history-directory__action-button--danger"
                type="button"
                data-action="history-delete-request-v1"
                data-history-id="${record.id}"
              >
                删除
              </button>
            </div>
            ${isDeletePending ? createDeleteBubble(record.id) : ""}
          </div>
        </td>
      </tr>
    `;
  }

  function createEmptyState() {
    return `
      <div class="history-directory__empty">
        <div class="history-directory__empty-content">
          <h2 class="history-directory__empty-title">还没有历史记录</h2>
          <p class="history-directory__empty-text">完成页面测试或流程测试后，这里会按日期倒序展示测试历史。</p>
        </div>
      </div>
    `;
  }

  function createTable(records) {
    return `
      <div class="history-directory__table-card">
        <table class="history-directory__table">
          <thead>
            <tr class="history-directory__head-row">
              <th class="history-directory__head history-directory__head--date">日期</th>
              <th class="history-directory__head history-directory__head--task-name">任务名称</th>
              <th class="history-directory__head history-directory__head--user-type">用户类型</th>
              <th class="history-directory__head history-directory__head--task-description">任务描述</th>
              <th class="history-directory__head history-directory__head--actions">操作</th>
            </tr>
          </thead>
          <tbody>
            ${records.map(createRow).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function createHistoryPage() {
    const records = sortRecords(readHistoryRecords());

    return `
      <section class="history-directory" aria-labelledby="history-page-title">
        <div class="history-directory__topbar">
          <button class="button button--subtle history-directory__back" type="button" data-route="home" aria-label="返回首页">
            <span class="history-directory__back-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M15 18l-6-6 6-6"></path>
              </svg>
            </span>
            <span>返回首页</span>
          </button>
        </div>

        <div class="history-directory__header">
          <div class="history-directory__title-group">
            <h1 id="history-page-title" class="history-directory__title">历史记录</h1>
            <p class="history-directory__subtitle">集中查看以往测试任务，按日期倒序快速回顾不同用户类型下的任务结果。</p>
          </div>
        </div>

        ${records.length ? createTable(records) : createEmptyState()}
      </section>
    `;
  }

  function mountHistoryPage() {
    pageRoot = document.querySelector(".history-directory");
    if (!pageRoot) {
      return;
    }

    pageRoot.querySelectorAll('[data-action="history-view-request-v1"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openRecordView(button.dataset.historyId, button.dataset.historyRoute || "page-test");
      });
    });

    pageRoot.querySelectorAll('[data-action="history-delete-request-v1"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        requestDelete(button.dataset.historyId);
      });
    });

    pageRoot.querySelectorAll('[data-action="history-delete-cancel-v1"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        cancelDelete();
      });
    });

    pageRoot.querySelectorAll('[data-action="history-delete-confirm-v1"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        confirmDelete(button.dataset.historyId);
      });
    });
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
    writeHistoryRecords(readHistoryRecords().filter((record) => record.id !== id));
    refreshPage();
  }

  function openRecordView(id, route) {
    const record = readHistoryRecords().find((item) => item.id === id);
    if (!record) {
      return;
    }

    const payload = JSON.stringify({
      recordId: record.id,
      route,
      timestamp: Date.now(),
    });

    try {
      global.sessionStorage?.setItem(HISTORY_VIEW_STORAGE_KEY, payload);
    } catch (error) {
      // Fall back to localStorage below.
    }

    try {
      global.localStorage?.setItem(HISTORY_VIEW_STORAGE_KEY, payload);
    } catch (error) {
      // Ignore storage failures and still try routing.
    }

    global.AppRouter?.setHashRoute(route);
  }

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    switch (actionTarget.dataset.action) {
      case "history-view-request-v1":
        openRecordView(actionTarget.dataset.historyId, actionTarget.dataset.historyRoute || "page-test");
        return;
      case "history-delete-request-v1":
        requestDelete(actionTarget.dataset.historyId);
        return;
      case "history-delete-cancel-v1":
        cancelDelete();
        return;
      case "history-delete-confirm-v1":
        confirmDelete(actionTarget.dataset.historyId);
        return;
      default:
        break;
    }
  });

  global.HistoryPage = {
    createHistoryPage,
    mountHistoryPage,
  };
})(window);
