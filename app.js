const STORAGE_KEY = "idea-execution-console-data-v1";
const THEME_KEY = "idea-execution-console-theme";
const GITHUB_SYNC_KEY = "idea-execution-console-github-sync-v1";
const APP_VERSION = 1;
const GITHUB_SYNC_FILE_NAME = "idea-execution-console-data.json";
const GITHUB_SYNC_DESCRIPTION = "Idea Execution Console data sync";
const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

const PAPER_SECTIONS = [
  { key: "title", label: "Title" },
  { key: "abstract", label: "Abstract" },
  { key: "introduction", label: "Introduction" },
  { key: "methods", label: "Methods" },
  { key: "results", label: "Results" },
  { key: "discussion", label: "Discussion" },
  { key: "conclusion", label: "Conclusion" },
  { key: "figures", label: "Figures" },
  { key: "captions", label: "Captions" },
  { key: "references", label: "References" },
  { key: "supplementaryMaterial", label: "Supplementary material" }
];

const PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2 };
const IDEA_STATUS_ORDER = { Active: 0, New: 1, Parked: 2, Completed: 3, Killed: 4 };
const VIEW_NAMES = [
  "dashboard",
  "ideaGarden",
  "currentWork",
  "urgentWork",
  "timeBlocking",
  "paperTracker",
  "weeklyReview"
];

const uiState = {
  activeView: "dashboard",
  ideaQuery: "",
  ideaStatusFilter: "all",
  ideaCategoryFilter: "all",
  scheduleDate: todayISO()
};

// Persistent data lives in localStorage; UI state only controls the current screen and filters.
let state = loadState();
let githubSyncSettings = loadGitHubSyncSettings();
let toastTimeoutId = null;
let githubAutoSyncTimeoutId = null;
let isGitHubSyncInFlight = false;

document.addEventListener("DOMContentLoaded", init);

function init() {
  // The app is intentionally tiny: load state, wire events, then render the full static UI.
  syncViewFromLocation();
  applyTheme(loadTheme(), { skipGitHubSync: true });
  bindEvents();
  primeForms();
  renderAll();
  ensureViewHistoryState();
  initNativeShell();
}

function bindEvents() {
  document.querySelectorAll("[data-view-target]").forEach((control) => {
    control.addEventListener("click", () => {
      setActiveView(control.dataset.viewTarget, {
        updateHistory: true,
        scrollTarget: control.dataset.scrollTarget
      });
    });
  });

  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("exportButton").addEventListener("click", () => {
    exportBackup().catch((error) => {
      console.error(error);
      showToast("Backup export failed.");
    });
  });
  document.getElementById("importInput").addEventListener("change", importBackup);
  document.getElementById("resetDemoButton").addEventListener("click", resetDemoData);
  document.getElementById("githubSyncForm").addEventListener("input", handleGitHubSyncSettingsChange);
  document.getElementById("githubSyncForm").addEventListener("change", handleGitHubSyncSettingsChange);
  document.getElementById("githubSaveButton").addEventListener("click", () => {
    saveToGitHub().catch(() => {
      // Error handling is surfaced inside saveToGitHub.
    });
  });
  document.getElementById("githubLoadButton").addEventListener("click", () => {
    loadFromGitHub().catch(() => {
      // Error handling is surfaced inside loadFromGitHub.
    });
  });
  document.getElementById("githubClearSettingsButton").addEventListener("click", clearGitHubSyncSettings);

  document.getElementById("ideaSearch").addEventListener("input", (event) => {
    uiState.ideaQuery = event.target.value.trim().toLowerCase();
    renderIdeas();
  });

  document.getElementById("ideaStatusFilter").addEventListener("change", (event) => {
    uiState.ideaStatusFilter = event.target.value;
    renderIdeas();
  });

  document.getElementById("ideaCategoryFilter").addEventListener("change", (event) => {
    uiState.ideaCategoryFilter = event.target.value;
    renderIdeas();
  });

  document.getElementById("scheduleDateFilter").addEventListener("change", (event) => {
    uiState.scheduleDate = event.target.value || todayISO();
    renderTimeBlocks();
  });

  document.getElementById("ideaForm").addEventListener("submit", handleIdeaSubmit);
  document.getElementById("currentWorkForm").addEventListener("submit", handleCurrentWorkSubmit);
  document.getElementById("urgentWorkForm").addEventListener("submit", handleUrgentWorkSubmit);
  document.getElementById("timeBlockForm").addEventListener("submit", handleTimeBlockSubmit);
  document.getElementById("paperForm").addEventListener("submit", handlePaperSubmit);
  document.getElementById("weeklyReviewForm").addEventListener("submit", handleWeeklyReviewSubmit);

  document.querySelectorAll("[data-reset-form]").forEach((button) => {
    button.addEventListener("click", () => clearForm(button.dataset.resetForm));
  });

  document.addEventListener("click", handleDelegatedClick);
  document.addEventListener("change", handleDelegatedChange);
  window.addEventListener("popstate", handleHistoryNavigation);
}

function primeForms() {
  document.querySelector("#timeBlockForm [name='date']").value = todayISO();
  document.getElementById("scheduleDateFilter").value = uiState.scheduleDate;
  renderGitHubSyncPanel();
}

function renderAll() {
  renderViews();
  renderDashboard();
  renderIdeas();
  renderCurrentWork();
  renderUrgentWork();
  renderTimeBlocks();
  renderPapers();
  renderWeeklyReview();
}

function setActiveView(viewName, options = {}) {
  const normalizedView = normalizeViewName(viewName);
  if (!normalizedView) {
    return;
  }

  const previousView = uiState.activeView;
  uiState.activeView = normalizedView;
  renderViews();

  if (options.updateHistory) {
    updateViewHistory(normalizedView, {
      replace: options.replaceHistory || previousView === normalizedView
    });
  }

  if (options.scroll === false) {
    return;
  }

  if (scrollToView(normalizedView)) {
    return;
  }

  if (options.scrollTarget) {
    scrollToElementById(options.scrollTarget);
  }
}

function renderViews() {
  document.querySelectorAll(".tab").forEach((button) => {
    const isActive = button.dataset.viewTarget === uiState.activeView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.view === uiState.activeView);
  });
}

function handleHistoryNavigation() {
  const nextView = getViewFromLocationHash();
  const fallbackView = nextView || VIEW_NAMES[0];

  if (fallbackView === uiState.activeView) {
    return;
  }

  uiState.activeView = fallbackView;
  renderViews();
}

function renderDashboard() {
  const stats = getDashboardStats();
  const topPriorityItems = getTopPriorityItems();
  const todaysBlocks = getBlocksForDate(todayISO());

  document.getElementById("todayDate").textContent = formatLongDate(todayISO());
  document.getElementById("activeWorkCount").textContent = String(stats.activeWork);
  document.getElementById("urgentWorkCount").textContent = String(stats.urgentWork);
  document.getElementById("newIdeasCount").textContent = String(stats.newIdeas);
  document.getElementById("parkedIdeasCount").textContent = String(stats.parkedIdeas);
  document.getElementById("completedTasksCount").textContent = String(stats.completedTasks);
  document.getElementById("dashboardOverloadWarning").classList.toggle("hidden", stats.activeWork <= 3);

  document.getElementById("topPriorityList").innerHTML = topPriorityItems.length
    ? topPriorityItems.map(renderPriorityItem).join("")
    : renderEmptyState("No priorities yet.", "Promote an idea or add urgent work to establish execution focus.");

  document.getElementById("todayTimeBlocks").innerHTML = todaysBlocks.length
    ? todaysBlocks.map((block) => renderTimelineItem(block, { compact: true })).join("")
    : renderEmptyState("No time blocks for today.", "Create a daily block so execution has a visible container.");

  renderHeroPreview({ stats, topPriorityItems, todaysBlocks });
}

function renderHeroPreview({ stats, topPriorityItems, todaysBlocks }) {
  setTextIfPresent("heroCurrentDate", formatShortDate(todayISO()));
  setTextIfPresent("heroActiveWorkCount", String(stats.activeWork));
  setTextIfPresent("heroUrgentWorkCount", String(stats.urgentWork));
  setTextIfPresent("heroNewIdeasCount", String(stats.newIdeas));
  setTextIfPresent("heroPaperCount", String(state.papers.length));

  const priorityPreview = document.getElementById("heroPriorityPreview");
  if (priorityPreview) {
    priorityPreview.innerHTML = topPriorityItems.length
      ? topPriorityItems.slice(0, 2).map(renderPriorityItem).join("")
      : renderEmptyState("No priorities yet.", "Choose the work that deserves today's attention.");
  }

  const schedulePreview = document.getElementById("heroSchedulePreview");
  if (schedulePreview) {
    schedulePreview.innerHTML = todaysBlocks.length
      ? todaysBlocks.slice(0, 2).map((block) => renderTimelineItem(block, { compact: true })).join("")
      : renderEmptyState("No blocks planned.", "Plan a block to turn intent into scheduled execution.");
  }
}

function renderIdeas() {
  const ideaCards = getFilteredIdeas();
  const ideaList = document.getElementById("ideaList");

  ideaList.innerHTML = ideaCards.length
    ? ideaCards.map(renderIdeaCard).join("")
    : renderEmptyState("No ideas match this filter.", "Try adjusting search terms, or add a new idea.");
}

function renderCurrentWork() {
  const sorted = [...state.currentWork].sort(compareCurrentWork);
  const activeCount = state.currentWork.filter((item) => item.status !== "Done").length;

  document.getElementById("currentWorkSummary").textContent = `${activeCount} active project${activeCount === 1 ? "" : "s"}`;
  document.getElementById("activeWorkWarning").classList.toggle("hidden", activeCount <= 3);

  document.getElementById("currentWorkList").innerHTML = sorted.length
    ? sorted.map(renderCurrentWorkCard).join("")
    : renderEmptyState("No active work yet.", "Move a strong idea into current work when it earns a slot.");

  renderActiveWorkSuggestions();
}

function renderUrgentWork() {
  const sorted = [...state.urgentWork].sort(compareUrgentWork);
  document.getElementById("urgentWorkList").innerHTML = sorted.length
    ? sorted.map(renderUrgentWorkCard).join("")
    : renderEmptyState("No urgent work logged.", "Capture deadlines before they become surprises.");
}

function renderTimeBlocks() {
  const blocks = getBlocksForDate(uiState.scheduleDate);
  const plannedHours = calculateTotalHours(blocks);
  const completedHours = calculateTotalHours(blocks.filter((block) => block.completed));
  const linkedBlocks = blocks.filter(isTimeBlockConnectedToActiveWork).length;

  document.getElementById("scheduleDateFilter").value = uiState.scheduleDate;
  document.getElementById("plannedHoursValue").textContent = plannedHours.toFixed(1);
  document.getElementById("completedHoursValue").textContent = completedHours.toFixed(1);
  document.getElementById("timeBlockConnectionNote").textContent = blocks.length
    ? `${linkedBlocks}/${blocks.length} block${blocks.length === 1 ? "" : "s"} match current active work titles.`
    : "Choose a date and schedule blocks that map to your active work when possible.";

  document.getElementById("timeBlockSchedule").innerHTML = blocks.length
    ? blocks.map((block) => renderTimelineItem(block, { compact: false })).join("")
    : renderEmptyState("No blocks on this day.", "Create a block for writing, simulation, reading, or deep work.");
}

function renderPapers() {
  const sorted = [...state.papers].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  document.getElementById("paperList").innerHTML = sorted.length
    ? sorted.map(renderPaperCard).join("")
    : renderEmptyState("No papers tracked yet.", "Add a paper so you can see stage progress and section completion.");
}

function renderWeeklyReview() {
  const form = document.getElementById("weeklyReviewForm");
  const review = state.weeklyReview;

  getField(form, "finished").value = review.finished || "";
  getField(form, "stuck").value = review.stuck || "";
  getField(form, "parkIdeas").value = review.parkIdeas || "";
  getField(form, "killProject").value = review.killProject || "";
  getField(form, "topThreeTasks").value = review.topThreeTasks || "";
  document.getElementById("reviewWeekLabel").textContent = `Week of ${formatLongDate(startOfWeek(todayISO()))}`;
}

function handleIdeaSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const id = formData.get("id") || createId("idea");
  const existing = state.ideas.find((idea) => idea.id === id);

  const idea = {
    id,
    title: cleanText(formData.get("title")),
    description: cleanText(formData.get("description")),
    category: cleanText(formData.get("category")) || "Other",
    source: cleanText(formData.get("source")) || "self",
    effort: cleanText(formData.get("effort")) || "Medium",
    impact: cleanText(formData.get("impact")) || "Medium",
    urgency: cleanText(formData.get("urgency")) || "Medium",
    status: cleanText(formData.get("status")) || "New",
    related: cleanText(formData.get("related")),
    notes: cleanText(formData.get("notes")),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.ideas = upsertById(state.ideas, idea);
  persistState();
  clearForm("ideaForm");
  renderDashboard();
  renderIdeas();
  showToast(existing ? "Idea updated." : "Idea added to the garden.");
}

function handleCurrentWorkSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const id = formData.get("id") || createId("work");
  const existing = state.currentWork.find((item) => item.id === id);

  const workItem = {
    id,
    sourceIdeaId: existing?.sourceIdeaId || "",
    title: cleanText(formData.get("title")),
    goal: cleanText(formData.get("goal")),
    why: cleanText(formData.get("why")),
    nextAction: cleanText(formData.get("nextAction")),
    deadline: cleanText(formData.get("deadline")),
    priority: cleanText(formData.get("priority")) || "P2",
    progress: clampNumber(formData.get("progress"), 0, 100),
    blocker: cleanText(formData.get("blocker")),
    status: cleanText(formData.get("status")) || "Not started",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.currentWork = upsertById(state.currentWork, workItem);
  persistState();
  clearForm("currentWorkForm");
  renderDashboard();
  renderCurrentWork();
  renderTimeBlocks();
  showToast(existing ? "Current work updated." : "Current work item saved.");
}

function handleUrgentWorkSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const id = formData.get("id") || createId("urgent");
  const existing = state.urgentWork.find((item) => item.id === id);

  const urgentItem = {
    id,
    task: cleanText(formData.get("task")),
    deadline: cleanText(formData.get("deadline")),
    consequence: cleanText(formData.get("consequence")),
    estimatedTime: cleanText(formData.get("estimatedTime")),
    relatedProject: cleanText(formData.get("relatedProject")),
    done: formData.get("done") === "on",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.urgentWork = upsertById(state.urgentWork, urgentItem);
  persistState();
  clearForm("urgentWorkForm");
  renderDashboard();
  renderUrgentWork();
  showToast(existing ? "Urgent task updated." : "Urgent task saved.");
}

function handleTimeBlockSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const id = formData.get("id") || createId("block");
  const existing = state.timeBlocks.find((item) => item.id === id);
  const startTime = cleanText(formData.get("startTime"));
  const endTime = cleanText(formData.get("endTime"));

  if (!isValidTimeRange(startTime, endTime)) {
    showToast("End time must be after start time.");
    return;
  }

  const block = {
    id,
    date: cleanText(formData.get("date")) || todayISO(),
    startTime,
    endTime,
    task: cleanText(formData.get("task")),
    type: cleanText(formData.get("type")) || "Deep work",
    completed: formData.get("completed") === "on",
    notes: cleanText(formData.get("notes")),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.timeBlocks = upsertById(state.timeBlocks, block);
  uiState.scheduleDate = block.date;
  persistState();
  clearForm("timeBlockForm");
  renderDashboard();
  renderTimeBlocks();
  showToast(existing ? "Time block updated." : "Time block saved.");
}

function handlePaperSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const id = formData.get("id") || createId("paper");
  const existing = state.papers.find((paper) => paper.id === id);

  const sections = PAPER_SECTIONS.reduce((accumulator, section) => {
    accumulator[section.key] = formData.get(`section-${section.key}`) === "on";
    return accumulator;
  }, {});

  const paper = {
    id,
    paperTitle: cleanText(formData.get("paperTitle")),
    targetVenue: cleanText(formData.get("targetVenue")),
    currentStage: cleanText(formData.get("currentStage")) || "Idea",
    sections,
    notes: cleanText(formData.get("notes")),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.papers = upsertById(state.papers, paper);
  persistState();
  clearForm("paperForm");
  renderDashboard();
  renderPapers();
  showToast(existing ? "Paper tracker updated." : "Paper added.");
}

function handleWeeklyReviewSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  state.weeklyReview = {
    finished: cleanText(getField(form, "finished").value),
    stuck: cleanText(getField(form, "stuck").value),
    parkIdeas: cleanText(getField(form, "parkIdeas").value),
    killProject: cleanText(getField(form, "killProject").value),
    topThreeTasks: cleanText(getField(form, "topThreeTasks").value),
    updatedAt: new Date().toISOString()
  };

  persistState();
  showToast("Weekly review saved.");
}

function handleDelegatedClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const { action, id, section } = actionButton.dataset;

  switch (action) {
    case "edit-idea":
      populateIdeaForm(id);
      break;
    case "delete-idea":
      deleteItem("ideas", id, "Idea deleted.");
      break;
    case "move-idea-active":
      moveIdeaToActiveWork(id);
      break;
    case "park-idea":
      updateIdeaStatus(id, "Parked", "Idea parked.");
      break;
    case "kill-idea":
      updateIdeaStatus(id, "Killed", "Idea killed.");
      break;
    case "edit-work":
      populateCurrentWorkForm(id);
      break;
    case "delete-work":
      deleteItem("currentWork", id, "Current work item deleted.");
      break;
    case "mark-work-done":
      updateCurrentWorkStatus(id, "Done");
      break;
    case "edit-urgent":
      populateUrgentWorkForm(id);
      break;
    case "delete-urgent":
      deleteItem("urgentWork", id, "Urgent task deleted.");
      break;
    case "edit-block":
      populateTimeBlockForm(id);
      break;
    case "delete-block":
      deleteItem("timeBlocks", id, "Time block deleted.");
      break;
    case "edit-paper":
      populatePaperForm(id);
      break;
    case "delete-paper":
      deleteItem("papers", id, "Paper deleted.");
      break;
    case "clear-form":
      if (section) {
        clearForm(section);
      }
      break;
    default:
      break;
  }
}

function handleDelegatedChange(event) {
  const target = event.target;

  if (target.matches("[data-urgent-done-id]")) {
    const urgentId = target.dataset.urgentDoneId;
    state.urgentWork = state.urgentWork.map((item) =>
      item.id === urgentId ? { ...item, done: target.checked, updatedAt: new Date().toISOString() } : item
    );
    persistState();
    renderDashboard();
    renderUrgentWork();
    return;
  }

  if (target.matches("[data-block-complete-id]")) {
    const blockId = target.dataset.blockCompleteId;
    state.timeBlocks = state.timeBlocks.map((block) =>
      block.id === blockId ? { ...block, completed: target.checked, updatedAt: new Date().toISOString() } : block
    );
    persistState();
    renderDashboard();
    renderTimeBlocks();
    return;
  }

  if (target.matches("[data-paper-section-id]")) {
    const paperId = target.dataset.paperSectionId;
    const sectionKey = target.dataset.paperSectionKey;

    state.papers = state.papers.map((paper) =>
      paper.id === paperId
        ? {
            ...paper,
            sections: {
              ...createEmptyPaperSections(),
              ...paper.sections,
              [sectionKey]: target.checked
            },
            updatedAt: new Date().toISOString()
          }
        : paper
    );
    persistState();
    renderPapers();
  }
}

function populateIdeaForm(id) {
  const idea = state.ideas.find((item) => item.id === id);
  if (!idea) {
    return;
  }

  const form = document.getElementById("ideaForm");
  getField(form, "id").value = idea.id;
  getField(form, "title").value = idea.title;
  getField(form, "description").value = idea.description;
  getField(form, "category").value = idea.category;
  getField(form, "source").value = idea.source;
  getField(form, "effort").value = idea.effort;
  getField(form, "impact").value = idea.impact;
  getField(form, "urgency").value = idea.urgency;
  getField(form, "status").value = idea.status;
  getField(form, "related").value = idea.related;
  getField(form, "notes").value = idea.notes;

  setActiveView("ideaGarden", { updateHistory: true, scroll: false });
  scrollToElement(form);
}

function populateCurrentWorkForm(id) {
  const item = state.currentWork.find((record) => record.id === id);
  if (!item) {
    return;
  }

  const form = document.getElementById("currentWorkForm");
  getField(form, "id").value = item.id;
  getField(form, "title").value = item.title;
  getField(form, "goal").value = item.goal;
  getField(form, "why").value = item.why;
  getField(form, "nextAction").value = item.nextAction;
  getField(form, "deadline").value = item.deadline;
  getField(form, "priority").value = item.priority;
  getField(form, "progress").value = item.progress;
  getField(form, "blocker").value = item.blocker;
  getField(form, "status").value = item.status;

  setActiveView("currentWork", { updateHistory: true, scroll: false });
  scrollToElement(form);
}

function populateUrgentWorkForm(id) {
  const item = state.urgentWork.find((record) => record.id === id);
  if (!item) {
    return;
  }

  const form = document.getElementById("urgentWorkForm");
  getField(form, "id").value = item.id;
  getField(form, "task").value = item.task;
  getField(form, "deadline").value = item.deadline;
  getField(form, "consequence").value = item.consequence;
  getField(form, "estimatedTime").value = item.estimatedTime;
  getField(form, "relatedProject").value = item.relatedProject;
  getField(form, "done").checked = item.done;

  setActiveView("urgentWork", { updateHistory: true, scroll: false });
  scrollToElement(form);
}

function populateTimeBlockForm(id) {
  const block = state.timeBlocks.find((record) => record.id === id);
  if (!block) {
    return;
  }

  const form = document.getElementById("timeBlockForm");
  getField(form, "id").value = block.id;
  getField(form, "date").value = block.date;
  getField(form, "startTime").value = block.startTime;
  getField(form, "endTime").value = block.endTime;
  getField(form, "task").value = block.task;
  getField(form, "type").value = block.type;
  getField(form, "completed").checked = block.completed;
  getField(form, "notes").value = block.notes;

  uiState.scheduleDate = block.date;
  setActiveView("timeBlocking", { updateHistory: true, scroll: false });
  renderTimeBlocks();
  scrollToElement(form);
}

function populatePaperForm(id) {
  const paper = state.papers.find((record) => record.id === id);
  if (!paper) {
    return;
  }

  const form = document.getElementById("paperForm");
  getField(form, "id").value = paper.id;
  getField(form, "paperTitle").value = paper.paperTitle;
  getField(form, "targetVenue").value = paper.targetVenue;
  getField(form, "currentStage").value = paper.currentStage;
  getField(form, "notes").value = paper.notes;

  PAPER_SECTIONS.forEach((section) => {
    form.querySelector(`[name="section-${section.key}"]`).checked = Boolean(paper.sections?.[section.key]);
  });

  setActiveView("paperTracker", { updateHistory: true, scroll: false });
  scrollToElement(form);
}

function clearForm(formId) {
  const form = document.getElementById(formId);
  form.reset();

  if (formId === "timeBlockForm") {
    getField(form, "date").value = uiState.scheduleDate || todayISO();
  }

  if (formId === "currentWorkForm") {
    getField(form, "progress").value = 0;
  }
}

function moveIdeaToActiveWork(id) {
  const idea = state.ideas.find((item) => item.id === id);
  if (!idea) {
    return;
  }

  const existingWork = state.currentWork.find(
    (item) => item.sourceIdeaId === idea.id && item.status !== "Done"
  );

  state.ideas = state.ideas.map((item) =>
    item.id === id ? { ...item, status: "Active", updatedAt: new Date().toISOString() } : item
  );

  if (!existingWork) {
    const newWork = {
      id: createId("work"),
      sourceIdeaId: idea.id,
      title: idea.title,
      goal: idea.description,
      why: idea.notes || `Promoted from the ${idea.category.toLowerCase()} idea pipeline.`,
      nextAction: "",
      deadline: "",
      priority: mapIdeaToPriority(idea),
      progress: 0,
      blocker: "",
      status: "Not started",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    state.currentWork = [newWork, ...state.currentWork];
  }

  persistState();
  renderDashboard();
  renderIdeas();
  renderCurrentWork();
  renderTimeBlocks();
  showToast(existingWork ? "Idea marked active." : "Idea moved into current work.");
}

function updateIdeaStatus(id, status, message) {
  state.ideas = state.ideas.map((idea) =>
    idea.id === id ? { ...idea, status, updatedAt: new Date().toISOString() } : idea
  );
  persistState();
  renderDashboard();
  renderIdeas();
  showToast(message);
}

function updateCurrentWorkStatus(id, status) {
  state.currentWork = state.currentWork.map((item) =>
    item.id === id
      ? {
          ...item,
          status,
          progress: status === "Done" ? 100 : item.progress,
          updatedAt: new Date().toISOString()
        }
      : item
  );
  persistState();
  renderDashboard();
  renderCurrentWork();
  showToast("Current work status updated.");
}

function deleteItem(collectionName, id, message) {
  const confirmed = window.confirm("Delete this item?");
  if (!confirmed) {
    return;
  }

  state[collectionName] = state[collectionName].filter((item) => item.id !== id);
  persistState();
  renderDashboard();
  renderIdeas();
  renderCurrentWork();
  renderUrgentWork();
  renderTimeBlocks();
  renderPapers();
  showToast(message);
}

function renderIdeaCard(idea) {
  const muted = idea.status === "Killed" || idea.status === "Completed";
  const summary = [
    `<span class="badge accent">${escapeHtml(idea.category)}</span>`,
    `<span class="badge">${escapeHtml(idea.source)}</span>`,
    `<span class="badge ${idea.urgency === "High" ? "warm" : ""}">Urgency: ${escapeHtml(idea.urgency)}</span>`,
    `<span class="badge ${idea.impact === "High" ? "accent" : ""}">Impact: ${escapeHtml(idea.impact)}</span>`,
    `<span class="badge ${idea.status === "Killed" ? "danger" : idea.status === "Completed" ? "success" : ""}">${escapeHtml(idea.status)}</span>`
  ].join("");

  return `
    <article class="entity-card ${muted ? "is-muted" : ""}">
      <div class="entity-card-header">
        <div>
          <h4>${escapeHtml(idea.title)}</h4>
        </div>
        <div class="badge-row">${summary}</div>
      </div>

      <div class="detail-grid">
        ${idea.description ? `<p>${escapeHtml(idea.description)}</p>` : ""}
        <p><strong>Effort:</strong> ${escapeHtml(idea.effort)}</p>
        ${idea.related ? `<p><strong>Related:</strong> ${escapeHtml(idea.related)}</p>` : ""}
        ${idea.notes ? `<p><strong>Notes:</strong> ${escapeHtml(idea.notes)}</p>` : ""}
      </div>

      <div class="item-actions">
        <button type="button" class="mini-button" data-action="edit-idea" data-id="${idea.id}">Edit</button>
        <button type="button" class="mini-button" data-action="move-idea-active" data-id="${idea.id}">Move to Active Work</button>
        <button type="button" class="mini-button" data-action="park-idea" data-id="${idea.id}">Park Idea</button>
        <button type="button" class="mini-button" data-action="kill-idea" data-id="${idea.id}">Kill Idea</button>
        <button type="button" class="mini-button is-danger" data-action="delete-idea" data-id="${idea.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderCurrentWorkCard(item) {
  const isDone = item.status === "Done";
  const isOverdueFlag = isOverdue(item.deadline) && !isDone;

  return `
    <article class="entity-card ${isDone ? "is-muted" : ""} ${isOverdueFlag ? "is-overdue" : ""}">
      <div class="entity-card-header">
        <div>
          <h4>${escapeHtml(item.title)}</h4>
          <p class="eyebrow">${escapeHtml(item.priority)} priority</p>
        </div>
        <div class="badge-row">
          <span class="badge ${item.priority === "P1" ? "danger" : item.priority === "P2" ? "warm" : ""}">${escapeHtml(item.priority)}</span>
          <span class="badge ${isDone ? "success" : item.status === "Waiting" ? "warm" : "accent"}">${escapeHtml(item.status)}</span>
        </div>
      </div>

      <div class="detail-grid">
        ${item.goal ? `<p><strong>Goal:</strong> ${escapeHtml(item.goal)}</p>` : ""}
        ${item.why ? `<p><strong>Why it matters:</strong> ${escapeHtml(item.why)}</p>` : ""}
        ${item.nextAction ? `<p><strong>Next action:</strong> ${escapeHtml(item.nextAction)}</p>` : ""}
        ${item.deadline ? `<p><strong>Deadline:</strong> ${escapeHtml(formatShortDate(item.deadline))}</p>` : ""}
        ${item.blocker ? `<p><strong>Blocker:</strong> ${escapeHtml(item.blocker)}</p>` : ""}
      </div>

      <div>
        <div class="item-meta">
          <strong>Progress</strong>
          <span>${item.progress}%</span>
        </div>
        <div class="progress-shell" aria-label="Progress">
          <div class="progress-bar" style="width: ${item.progress}%"></div>
        </div>
      </div>

      <div class="item-actions">
        <button type="button" class="mini-button" data-action="edit-work" data-id="${item.id}">Edit</button>
        <button type="button" class="mini-button" data-action="mark-work-done" data-id="${item.id}">Mark Done</button>
        <button type="button" class="mini-button is-danger" data-action="delete-work" data-id="${item.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderUrgentWorkCard(item) {
  const overdue = isOverdue(item.deadline) && !item.done;

  return `
    <article class="entity-card ${item.done ? "is-muted" : ""} ${overdue ? "is-overdue" : ""}">
      <div class="entity-card-header">
        <div>
          <h4>${escapeHtml(item.task)}</h4>
          <p class="eyebrow">${escapeHtml(formatShortDate(item.deadline))}</p>
        </div>
        <div class="badge-row">
          <span class="badge ${overdue ? "danger" : "warm"}">${overdue ? "Overdue" : "Deadline"}</span>
          <span class="badge ${item.done ? "success" : ""}">${item.done ? "Done" : "Open"}</span>
        </div>
      </div>

      <div class="detail-grid">
        ${item.consequence ? `<p><strong>Consequence:</strong> ${escapeHtml(item.consequence)}</p>` : ""}
        ${item.estimatedTime ? `<p><strong>Estimated time:</strong> ${escapeHtml(item.estimatedTime)}</p>` : ""}
        ${item.relatedProject ? `<p><strong>Related project:</strong> ${escapeHtml(item.relatedProject)}</p>` : ""}
      </div>

      <label class="checkbox-row">
        <input type="checkbox" data-urgent-done-id="${item.id}" ${item.done ? "checked" : ""}>
        Done
      </label>

      <div class="item-actions">
        <button type="button" class="mini-button" data-action="edit-urgent" data-id="${item.id}">Edit</button>
        <button type="button" class="mini-button is-danger" data-action="delete-urgent" data-id="${item.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderPaperCard(paper) {
  const completion = getPaperCompletion(paper);

  return `
    <article class="entity-card">
      <div class="entity-card-header">
        <div>
          <h4>${escapeHtml(paper.paperTitle)}</h4>
          ${paper.targetVenue ? `<p class="eyebrow">${escapeHtml(paper.targetVenue)}</p>` : ""}
        </div>
        <div class="badge-row">
          <span class="badge accent">${escapeHtml(paper.currentStage)}</span>
          <span class="badge ${completion === 100 ? "success" : "warm"}">${completion}% complete</span>
        </div>
      </div>

      <div>
        <div class="item-meta">
          <strong>Section completion</strong>
          <span>${completion}%</span>
        </div>
        <div class="progress-shell" aria-label="Paper completion">
          <div class="progress-bar" style="width: ${completion}%"></div>
        </div>
      </div>

      <div class="paper-checklist">
        ${PAPER_SECTIONS.map((section) => `
          <label>
            <input
              type="checkbox"
              data-paper-section-id="${paper.id}"
              data-paper-section-key="${section.key}"
              ${paper.sections?.[section.key] ? "checked" : ""}
            >
            ${escapeHtml(section.label)}
          </label>
        `).join("")}
      </div>

      ${paper.notes ? `<p><strong>Notes:</strong> ${escapeHtml(paper.notes)}</p>` : ""}

      <div class="item-actions">
        <button type="button" class="mini-button" data-action="edit-paper" data-id="${paper.id}">Edit</button>
        <button type="button" class="mini-button is-danger" data-action="delete-paper" data-id="${paper.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderPriorityItem(item) {
  const badgeClass = item.kind === "Urgent" ? "danger" : "accent";

  return `
    <article class="priority-item">
      <div class="priority-header">
        <div>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.subtitle)}</p>
        </div>
        <span class="badge ${badgeClass}">${escapeHtml(item.kind)}</span>
      </div>
      ${item.next ? `<p><strong>Next step:</strong> ${escapeHtml(item.next)}</p>` : ""}
      ${item.deadline ? `<p><strong>Deadline:</strong> ${escapeHtml(formatShortDate(item.deadline))}</p>` : ""}
    </article>
  `;
}

function renderTimelineItem(block, options = { compact: false }) {
  const isConnected = isTimeBlockConnectedToActiveWork(block);
  const overdue = block.date < todayISO() && !block.completed;

  return `
    <article class="timeline-item ${overdue ? "is-overdue" : ""}">
      <div class="timeline-header">
        <div>
          <p class="timeline-time">${escapeHtml(block.startTime)} - ${escapeHtml(block.endTime)}</p>
          <h4>${escapeHtml(block.task)}</h4>
        </div>
        <div class="badge-row">
          <span class="badge accent">${escapeHtml(block.type)}</span>
          <span class="badge ${block.completed ? "success" : isConnected ? "accent" : "warm"}">
            ${block.completed ? "Completed" : isConnected ? "Linked to active work" : "Standalone"}
          </span>
        </div>
      </div>
      ${options.compact ? "" : `<p><strong>Date:</strong> ${escapeHtml(formatShortDate(block.date))}</p>`}
      ${block.notes ? `<p><strong>Notes:</strong> ${escapeHtml(block.notes)}</p>` : ""}
      ${options.compact ? "" : `
        <label class="checkbox-row">
          <input type="checkbox" data-block-complete-id="${block.id}" ${block.completed ? "checked" : ""}>
          Completed
        </label>
      `}
      ${options.compact ? "" : `
        <div class="item-actions">
          <button type="button" class="mini-button" data-action="edit-block" data-id="${block.id}">Edit</button>
          <button type="button" class="mini-button is-danger" data-action="delete-block" data-id="${block.id}">Delete</button>
        </div>
      `}
    </article>
  `;
}

function renderActiveWorkSuggestions() {
  const datalist = document.getElementById("activeWorkSuggestions");
  const suggestions = state.currentWork
    .filter((item) => item.status !== "Done")
    .map((item) => `<option value="${escapeHtml(item.title)}"></option>`)
    .join("");

  datalist.innerHTML = suggestions;
}

function getFilteredIdeas() {
  return [...state.ideas]
    .filter((idea) => {
      const matchesQuery = !uiState.ideaQuery || [
        idea.title,
        idea.description,
        idea.notes,
        idea.related
      ].join(" ").toLowerCase().includes(uiState.ideaQuery);

      const matchesStatus = uiState.ideaStatusFilter === "all" || idea.status === uiState.ideaStatusFilter;
      const matchesCategory = uiState.ideaCategoryFilter === "all" || idea.category === uiState.ideaCategoryFilter;

      return matchesQuery && matchesStatus && matchesCategory;
    })
    .sort((a, b) => {
      const statusSort = (IDEA_STATUS_ORDER[a.status] ?? 99) - (IDEA_STATUS_ORDER[b.status] ?? 99);
      if (statusSort !== 0) {
        return statusSort;
      }

      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

function getDashboardStats() {
  return {
    activeWork: state.currentWork.filter((item) => item.status !== "Done").length,
    urgentWork: state.urgentWork.filter((item) => !item.done).length,
    newIdeas: state.ideas.filter((idea) => idea.status === "New").length,
    parkedIdeas: state.ideas.filter((idea) => idea.status === "Parked").length,
    completedTasks:
      state.currentWork.filter((item) => item.status === "Done").length +
      state.urgentWork.filter((item) => item.done).length +
      state.ideas.filter((idea) => idea.status === "Completed").length
  };
}

function getTopPriorityItems() {
  const urgentItems = state.urgentWork
    .filter((item) => !item.done)
    .sort(compareUrgentWork)
    .map((item) => ({
      title: item.task,
      subtitle: item.relatedProject || "Urgent task",
      deadline: item.deadline,
      next: item.estimatedTime ? `Reserve ${item.estimatedTime}` : "",
      kind: "Urgent"
    }));

  const workItems = state.currentWork
    .filter((item) => item.status !== "Done")
    .sort(compareCurrentWork)
    .map((item) => ({
      title: item.title,
      subtitle: `${item.priority} priority active work`,
      deadline: item.deadline,
      next: item.nextAction,
      kind: "Active"
    }));

  return [...urgentItems, ...workItems].slice(0, 3);
}

function getBlocksForDate(date) {
  return [...state.timeBlocks]
    .filter((block) => block.date === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function getPaperCompletion(paper) {
  const completedCount = PAPER_SECTIONS.filter((section) => paper.sections?.[section.key]).length;
  return Math.round((completedCount / PAPER_SECTIONS.length) * 100);
}

function calculateTotalHours(blocks) {
  return blocks.reduce((total, block) => total + getBlockDurationHours(block), 0);
}

function getBlockDurationHours(block) {
  const start = timeToMinutes(block.startTime);
  const end = timeToMinutes(block.endTime);
  return Math.max(0, end - start) / 60;
}

function isTimeBlockConnectedToActiveWork(block) {
  const activeTitles = state.currentWork
    .filter((item) => item.status !== "Done")
    .map((item) => item.title.trim().toLowerCase());
  return activeTitles.includes(block.task.trim().toLowerCase());
}

function compareCurrentWork(a, b) {
  const aDone = a.status === "Done";
  const bDone = b.status === "Done";

  if (aDone !== bDone) {
    return aDone ? 1 : -1;
  }

  const prioritySort = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
  if (prioritySort !== 0) {
    return prioritySort;
  }

  const deadlineA = a.deadline || "9999-12-31";
  const deadlineB = b.deadline || "9999-12-31";
  if (deadlineA !== deadlineB) {
    return deadlineA.localeCompare(deadlineB);
  }

  return b.updatedAt.localeCompare(a.updatedAt);
}

function compareUrgentWork(a, b) {
  if (a.done !== b.done) {
    return a.done ? 1 : -1;
  }

  return (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31");
}

function mapIdeaToPriority(idea) {
  if (idea.urgency === "High" || idea.impact === "High") {
    return "P1";
  }
  if (idea.urgency === "Medium" || idea.impact === "Medium") {
    return "P2";
  }
  return "P3";
}

function buildBackupPayload() {
  return {
    meta: {
      app: "Idea Execution Console",
      version: APP_VERSION,
      exportedAt: new Date().toISOString()
    },
    theme: document.body.dataset.theme || "light",
    data: state
  };
}

function applyImportedBackup(parsed, options = {}) {
  const candidateState = parsed.data || parsed;
  if (!isValidStatePayload(candidateState)) {
    throw new Error("Invalid backup payload");
  }

  state = normalizeState(candidateState);
  uiState.scheduleDate = todayISO();
  persistState({ skipGitHubSync: options.skipGitHubSync });

  if (parsed.theme) {
    applyTheme(parsed.theme, { skipGitHubSync: options.skipGitHubSync });
  }

  clearAllForms();
  renderAll();
}

async function exportBackup() {
  // JSON backups keep the app portable across browsers and devices without adding a backend.
  const payload = buildBackupPayload();
  const filename = `idea-execution-console-backup-${todayISO()}.json`;

  if (window.nativeShell?.isNativeApp && typeof window.nativeShell.exportJson === "function") {
    const nativeExport = await window.nativeShell.exportJson(filename, payload);
    if (nativeExport?.handled) {
      showToast("Backup opened in the Android share sheet.");
      return;
    }

    if (nativeExport?.message) {
      console.warn(nativeExport.message);
    }
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("Backup exported.");
}

function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      applyImportedBackup(parsed);
      showToast("Backup imported.");
    } catch (error) {
      showToast("Import failed. Please use a valid JSON backup.");
    } finally {
      event.target.value = "";
    }
  };

  reader.readAsText(file);
}

function resetDemoData() {
  const confirmed = window.confirm("Reset everything to the bundled PhD researcher demo data?");
  if (!confirmed) {
    return;
  }

  state = createSeedState();
  uiState.ideaQuery = "";
  uiState.ideaStatusFilter = "all";
  uiState.ideaCategoryFilter = "all";
  uiState.scheduleDate = todayISO();
  persistState();
  clearAllForms();
  renderAll();
  showToast("Demo data restored.");
}

function clearAllForms() {
  clearForm("ideaForm");
  clearForm("currentWorkForm");
  clearForm("urgentWorkForm");
  clearForm("timeBlockForm");
  clearForm("paperForm");

  document.getElementById("ideaSearch").value = "";
  document.getElementById("ideaStatusFilter").value = "all";
  document.getElementById("ideaCategoryFilter").value = "all";
  document.getElementById("scheduleDateFilter").value = uiState.scheduleDate;
}

function applyTheme(theme, options = {}) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = normalizedTheme;
  localStorage.setItem(THEME_KEY, normalizedTheme);
  document.getElementById("themeToggle").textContent =
    normalizedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  if (!options.skipGitHubSync) {
    scheduleGitHubAutoSync();
  }
}

function toggleTheme() {
  applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
}

function handleGitHubSyncSettingsChange() {
  githubSyncSettings = readGitHubSyncSettingsFromForm();
  persistGitHubSyncSettings();
  renderGitHubSyncPanel({ preserveFields: true });
}

function readGitHubSyncSettingsFromForm() {
  const form = document.getElementById("githubSyncForm");
  if (!form) {
    return { ...githubSyncSettings };
  }

  return {
    token: cleanText(getField(form, "token").value),
    gistId: cleanText(getField(form, "gistId").value),
    autoSync: getField(form, "autoSync").checked,
    gistUrl: githubSyncSettings.gistUrl || "",
    lastSyncedAt: githubSyncSettings.lastSyncedAt || ""
  };
}

function renderGitHubSyncPanel(options = {}) {
  const form = document.getElementById("githubSyncForm");
  if (!form) {
    return;
  }

  if (!options.preserveFields) {
    getField(form, "token").value = githubSyncSettings.token || "";
    getField(form, "gistId").value = githubSyncSettings.gistId || "";
    getField(form, "autoSync").checked = Boolean(githubSyncSettings.autoSync);
  }

  const status = document.getElementById("githubSyncStatus");
  const link = document.getElementById("githubSyncLink");

  let statusText = "Local autosave is always on. GitHub sync is optional and writes a JSON backup file to a secret gist.";
  if (githubSyncSettings.gistId && githubSyncSettings.lastSyncedAt) {
    statusText = `Connected to gist ${githubSyncSettings.gistId}. Last sync ${formatSyncTimestamp(githubSyncSettings.lastSyncedAt)}.`;
  } else if (githubSyncSettings.gistId) {
    statusText = `GitHub gist ${githubSyncSettings.gistId} is configured. Save or load to sync your data.`;
  } else if (githubSyncSettings.autoSync && githubSyncSettings.token) {
    statusText = "Auto-sync is armed. The next local save will create and update a secret GitHub JSON gist.";
  } else if (githubSyncSettings.token) {
    statusText = "GitHub token saved on this device. Save once to create the JSON backup gist.";
  }

  status.textContent = statusText;

  if (githubSyncSettings.gistUrl) {
    link.href = githubSyncSettings.gistUrl;
    link.classList.remove("hidden");
  } else {
    link.href = "#";
    link.classList.add("hidden");
  }
}

function clearGitHubSyncSettings() {
  const confirmed = window.confirm("Clear the saved GitHub sync token and gist settings on this device?");
  if (!confirmed) {
    return;
  }

  githubSyncSettings = createDefaultGitHubSyncSettings();
  localStorage.removeItem(GITHUB_SYNC_KEY);
  renderGitHubSyncPanel();
  showToast("GitHub sync settings cleared.");
}

function scheduleGitHubAutoSync() {
  if (!githubSyncSettings.autoSync || !githubSyncSettings.token) {
    return;
  }

  if (githubAutoSyncTimeoutId) {
    window.clearTimeout(githubAutoSyncTimeoutId);
  }

  githubAutoSyncTimeoutId = window.setTimeout(() => {
    saveToGitHub({ silent: true }).catch(() => {
      // Error handling is surfaced inside saveToGitHub.
    });
  }, 1400);
}

async function saveToGitHub(options = {}) {
  const { silent = false } = options;
  const settings = readGitHubSyncSettingsFromForm();

  if (!settings.token) {
    if (!silent) {
      showToast("Add a GitHub token first.");
    }
    return;
  }

  if (isGitHubSyncInFlight) {
    if (!silent) {
      showToast("A GitHub sync is already running.");
    }
    return;
  }

  isGitHubSyncInFlight = true;
  setGitHubSyncButtonsDisabled(true);

  try {
    const payload = buildBackupPayload();
    const requestBody = {
      description: GITHUB_SYNC_DESCRIPTION,
      files: {
        [GITHUB_SYNC_FILE_NAME]: {
          content: JSON.stringify(payload, null, 2)
        }
      }
    };

    const method = settings.gistId ? "PATCH" : "POST";
    const endpoint = settings.gistId
      ? `${GITHUB_API_BASE_URL}/gists/${encodeURIComponent(settings.gistId)}`
      : `${GITHUB_API_BASE_URL}/gists`;

    if (!settings.gistId) {
      requestBody.public = false;
    }

    const response = await fetch(endpoint, {
      method,
      headers: createGitHubHeaders(settings.token),
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData.message || "GitHub sync failed.");
    }

    githubSyncSettings = {
      ...settings,
      gistId: responseData.id || settings.gistId,
      gistUrl: responseData.html_url || settings.gistUrl || "",
      lastSyncedAt: new Date().toISOString()
    };
    persistGitHubSyncSettings();
    renderGitHubSyncPanel();

    if (!silent) {
      showToast(settings.gistId ? "Saved to GitHub." : "Created GitHub JSON backup.");
    }
  } catch (error) {
    renderGitHubSyncStatus(`GitHub save failed: ${error.message}`);
    if (!silent) {
      showToast(error.message);
    }
  } finally {
    isGitHubSyncInFlight = false;
    setGitHubSyncButtonsDisabled(false);
  }
}

async function loadFromGitHub() {
  const settings = readGitHubSyncSettingsFromForm();

  if (!settings.gistId) {
    showToast("Add a Gist ID or save once to create the GitHub JSON file.");
    return;
  }

  setGitHubSyncButtonsDisabled(true);

  try {
    const response = await fetch(`${GITHUB_API_BASE_URL}/gists/${encodeURIComponent(settings.gistId)}`, {
      headers: createGitHubHeaders(settings.token)
    });
    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData.message || "GitHub load failed.");
    }

    const gistFile = getGitHubSyncFile(responseData);
    if (!gistFile) {
      throw new Error(`Could not find ${GITHUB_SYNC_FILE_NAME} in that gist.`);
    }

    let rawContent = gistFile.content;
    if (!rawContent && gistFile.raw_url) {
      const rawResponse = await fetch(gistFile.raw_url);
      rawContent = await rawResponse.text();
    }

    if (!rawContent) {
      throw new Error("The GitHub JSON file was empty.");
    }

    const parsed = JSON.parse(rawContent);
    applyImportedBackup(parsed, { skipGitHubSync: true });

    githubSyncSettings = {
      ...settings,
      gistUrl: responseData.html_url || settings.gistUrl || "",
      lastSyncedAt: new Date().toISOString()
    };
    persistGitHubSyncSettings();
    renderGitHubSyncPanel();
    showToast("Loaded from GitHub.");
  } catch (error) {
    renderGitHubSyncStatus(`GitHub load failed: ${error.message}`);
    showToast(error.message);
  } finally {
    setGitHubSyncButtonsDisabled(false);
  }
}

function renderGitHubSyncStatus(message) {
  document.getElementById("githubSyncStatus").textContent = message;
}

function setGitHubSyncButtonsDisabled(disabled) {
  document.getElementById("githubSaveButton").disabled = disabled;
  document.getElementById("githubLoadButton").disabled = disabled;
}

function createGitHubHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function getGitHubSyncFile(gistResponse) {
  const files = Object.values(gistResponse.files || {});
  return (
    files.find((file) => file.filename === GITHUB_SYNC_FILE_NAME) ||
    files.find((file) => String(file.filename || "").toLowerCase().endsWith(".json")) ||
    null
  );
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");

  if (toastTimeoutId) {
    window.clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return createSeedState();
  }

  try {
    return normalizeState(JSON.parse(saved));
  } catch (error) {
    return createSeedState();
  }
}

function persistState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (!options.skipGitHubSync) {
    scheduleGitHubAutoSync();
  }
}

function normalizeState(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return createSeedState();
  }

  return {
    ideas: Array.isArray(candidate.ideas) ? candidate.ideas.map(normalizeIdea) : [],
    currentWork: Array.isArray(candidate.currentWork) ? candidate.currentWork.map(normalizeCurrentWork) : [],
    urgentWork: Array.isArray(candidate.urgentWork) ? candidate.urgentWork.map(normalizeUrgentWork) : [],
    timeBlocks: Array.isArray(candidate.timeBlocks) ? candidate.timeBlocks.map(normalizeTimeBlock) : [],
    papers: Array.isArray(candidate.papers) ? candidate.papers.map(normalizePaper) : [],
    weeklyReview: {
      finished: cleanText(candidate.weeklyReview?.finished),
      stuck: cleanText(candidate.weeklyReview?.stuck),
      parkIdeas: cleanText(candidate.weeklyReview?.parkIdeas),
      killProject: cleanText(candidate.weeklyReview?.killProject),
      topThreeTasks: cleanText(candidate.weeklyReview?.topThreeTasks),
      updatedAt: candidate.weeklyReview?.updatedAt || new Date().toISOString()
    }
  };
}

function normalizeIdea(idea) {
  return {
    id: idea.id || createId("idea"),
    title: cleanText(idea.title),
    description: cleanText(idea.description),
    category: cleanText(idea.category) || "Other",
    source: cleanText(idea.source) || "self",
    effort: cleanText(idea.effort) || "Medium",
    impact: cleanText(idea.impact) || "Medium",
    urgency: cleanText(idea.urgency) || "Medium",
    status: cleanText(idea.status) || "New",
    related: cleanText(idea.related),
    notes: cleanText(idea.notes),
    createdAt: idea.createdAt || new Date().toISOString(),
    updatedAt: idea.updatedAt || new Date().toISOString()
  };
}

function normalizeCurrentWork(item) {
  return {
    id: item.id || createId("work"),
    sourceIdeaId: cleanText(item.sourceIdeaId),
    title: cleanText(item.title),
    goal: cleanText(item.goal),
    why: cleanText(item.why),
    nextAction: cleanText(item.nextAction),
    deadline: cleanText(item.deadline),
    priority: cleanText(item.priority) || "P2",
    progress: clampNumber(item.progress, 0, 100),
    blocker: cleanText(item.blocker),
    status: cleanText(item.status) || "Not started",
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function normalizeUrgentWork(item) {
  return {
    id: item.id || createId("urgent"),
    task: cleanText(item.task),
    deadline: cleanText(item.deadline),
    consequence: cleanText(item.consequence),
    estimatedTime: cleanText(item.estimatedTime),
    relatedProject: cleanText(item.relatedProject),
    done: Boolean(item.done),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function normalizeTimeBlock(block) {
  return {
    id: block.id || createId("block"),
    date: cleanText(block.date) || todayISO(),
    startTime: cleanText(block.startTime) || "09:00",
    endTime: cleanText(block.endTime) || "10:00",
    task: cleanText(block.task),
    type: cleanText(block.type) || "Deep work",
    completed: Boolean(block.completed),
    notes: cleanText(block.notes),
    createdAt: block.createdAt || new Date().toISOString(),
    updatedAt: block.updatedAt || new Date().toISOString()
  };
}

function normalizePaper(paper) {
  return {
    id: paper.id || createId("paper"),
    paperTitle: cleanText(paper.paperTitle),
    targetVenue: cleanText(paper.targetVenue),
    currentStage: cleanText(paper.currentStage) || "Idea",
    sections: {
      ...createEmptyPaperSections(),
      ...(paper.sections || {})
    },
    notes: cleanText(paper.notes),
    createdAt: paper.createdAt || new Date().toISOString(),
    updatedAt: paper.updatedAt || new Date().toISOString()
  };
}

function createSeedState() {
  // Seed data keeps the dashboard useful on first launch and demonstrates the intended workflow.
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const inTwoDays = addDays(today, 2);
  const inThreeDays = addDays(today, 3);
  const inFourDays = addDays(today, 4);

  const tvcIdeaId = createId("idea");
  const hydrogenIdeaId = createId("idea");
  const convergeIdeaId = createId("idea");
  const dashboardIdeaId = createId("idea");

  return normalizeState({
    ideas: [
      {
        id: tvcIdeaId,
        title: "Finish TVC combustion paper",
        description: "Push the paper to a submission-ready draft with final figures and discussion refinements.",
        category: "Paper",
        source: "self",
        effort: "High",
        impact: "High",
        urgency: "High",
        status: "Active",
        related: "TVC combustion manuscript",
        notes: "Advisor expects a clean near-final draft this week."
      },
      {
        id: hydrogenIdeaId,
        title: "Revise high-pressure hydrogen combustion figures",
        description: "Rework the figure set so the trends are publication-ready and internally reviewable.",
        category: "Paper",
        source: "advisor",
        effort: "Medium",
        impact: "High",
        urgency: "High",
        status: "Active",
        related: "Hydrogen combustion study",
        notes: "Focus on consistency of labels, legends, and color scale."
      },
      {
        id: convergeIdeaId,
        title: "CONVERGE simulation debugging",
        description: "Resolve solver instability in the latest ignition delay setup and recover the run pipeline.",
        category: "Simulation",
        source: "experiment",
        effort: "High",
        impact: "High",
        urgency: "Medium",
        status: "Active",
        related: "Injector instability setup",
        notes: "Check mesh sensitivity and boundary condition assumptions."
      },
      {
        id: dashboardIdeaId,
        title: "HTML combustion dashboard idea",
        description: "Build an interactive combustion dashboard for lab metrics and manuscript status.",
        category: "Code",
        source: "AI",
        effort: "Medium",
        impact: "Medium",
        urgency: "Low",
        status: "Parked",
        related: "Lab operations dashboard",
        notes: "Worth revisiting after the current paper push."
      },
      {
        title: "Literature synthesis sprint for detonation modeling",
        description: "Collect ten core papers and identify a gap map for the thesis introduction.",
        category: "Reading",
        source: "paper",
        effort: "Medium",
        impact: "Medium",
        urgency: "Low",
        status: "New",
        related: "Thesis literature map",
        notes: "Capture this but do not activate yet."
      }
    ],
    currentWork: [
      {
        sourceIdeaId: tvcIdeaId,
        title: "Finish TVC combustion paper",
        goal: "Prepare a polished near-final manuscript draft for advisor review.",
        why: "This paper is the clearest short-term research output and feeds thesis momentum.",
        nextAction: "Finalize the flame anchoring discussion paragraph and integrate uncertainty values.",
        deadline: inThreeDays,
        priority: "P1",
        progress: 68,
        blocker: "Waiting on final uncertainty numbers from the latest post-processing pass.",
        status: "In progress"
      },
      {
        sourceIdeaId: hydrogenIdeaId,
        title: "Revise high-pressure hydrogen combustion figures",
        goal: "Bring the figure package to internal-review quality.",
        why: "Weak figures are blocking the next paper review cycle.",
        nextAction: "Replot pressure traces with a consistent legend hierarchy.",
        deadline: inTwoDays,
        priority: "P1",
        progress: 42,
        blocker: "Need to confirm the final color scale with advisor.",
        status: "In progress"
      },
      {
        sourceIdeaId: convergeIdeaId,
        title: "CONVERGE simulation debugging",
        goal: "Resolve the diverging case so the dataset can be trusted for analysis.",
        why: "The simulation outputs are needed for both the next paper and the thesis chapter.",
        nextAction: "Test a reduced timestep and compare the boundary setup against the last stable case.",
        deadline: inFourDays,
        priority: "P2",
        progress: 25,
        blocker: "Solver diverges after 2.1 ms on the current mesh.",
        status: "Waiting"
      }
    ],
    urgentWork: [
      {
        task: "Send advisor update on TVC paper status",
        deadline: tomorrow,
        consequence: "Advisor review window could slip by a week.",
        estimatedTime: "30 min",
        relatedProject: "Finish TVC combustion paper",
        done: false
      },
      {
        task: "Regenerate hydrogen figure captions",
        deadline: inTwoDays,
        consequence: "Figures cannot move into internal review.",
        estimatedTime: "1.5 h",
        relatedProject: "Revise high-pressure hydrogen combustion figures",
        done: false
      },
      {
        task: "Archive failed CONVERGE log set",
        deadline: inThreeDays,
        consequence: "Debug comparisons remain noisy and harder to trace.",
        estimatedTime: "45 min",
        relatedProject: "CONVERGE simulation debugging",
        done: false
      }
    ],
    timeBlocks: [
      {
        date: today,
        startTime: "08:30",
        endTime: "10:30",
        task: "Finish TVC combustion paper",
        type: "Writing",
        completed: false,
        notes: "Tighten results-to-discussion transition."
      },
      {
        date: today,
        startTime: "11:00",
        endTime: "12:30",
        task: "Revise high-pressure hydrogen combustion figures",
        type: "Deep work",
        completed: false,
        notes: "Focus on legends, axis labels, and panel ordering."
      },
      {
        date: today,
        startTime: "15:00",
        endTime: "16:30",
        task: "CONVERGE simulation debugging",
        type: "Simulation",
        completed: false,
        notes: "Compare reduced timestep behavior with prior stable run."
      },
      {
        date: tomorrow,
        startTime: "09:00",
        endTime: "10:00",
        task: "Send advisor update on TVC paper status",
        type: "Admin",
        completed: false,
        notes: "Include concrete ETA and ask one focused question."
      }
    ],
    papers: [
      {
        paperTitle: "TVC Combustion Dynamics Under Lean Operating Conditions",
        targetVenue: "Combustion and Flame",
        currentStage: "Discussion",
        sections: {
          title: true,
          abstract: false,
          introduction: true,
          methods: true,
          results: true,
          discussion: false,
          conclusion: false,
          figures: true,
          captions: false,
          references: true,
          supplementaryMaterial: false
        },
        notes: "Main manuscript; discussion and abstract still need tightening before advisor review."
      },
      {
        paperTitle: "High-Pressure Hydrogen Combustion Figure Package",
        targetVenue: "Fuel",
        currentStage: "Figures",
        sections: {
          title: true,
          abstract: false,
          introduction: false,
          methods: true,
          results: true,
          discussion: false,
          conclusion: false,
          figures: false,
          captions: false,
          references: true,
          supplementaryMaterial: false
        },
        notes: "Figure clarity is the current bottleneck."
      }
    ],
    weeklyReview: {
      finished: "Closed the baseline result checks for the TVC paper.\nCleaned the simulation directory structure.",
      stuck: "Need final uncertainty values.\nHydrogen figure styling is still inconsistent across panels.",
      parkIdeas: "Keep the HTML combustion dashboard idea parked until the paper push slows down.",
      killProject: "If CONVERGE debugging keeps stalling without insight, stop the branch and restart from the last stable case.",
      topThreeTasks: "Finish TVC discussion edits\nRegenerate hydrogen figure captions\nRun one focused CONVERGE stability test"
    }
  });
}

function createDefaultGitHubSyncSettings() {
  return {
    token: "",
    gistId: "",
    autoSync: false,
    gistUrl: "",
    lastSyncedAt: ""
  };
}

function loadGitHubSyncSettings() {
  const saved = localStorage.getItem(GITHUB_SYNC_KEY);
  if (!saved) {
    return createDefaultGitHubSyncSettings();
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      ...createDefaultGitHubSyncSettings(),
      ...parsed,
      token: cleanText(parsed.token),
      gistId: cleanText(parsed.gistId),
      autoSync: Boolean(parsed.autoSync),
      gistUrl: cleanText(parsed.gistUrl),
      lastSyncedAt: cleanText(parsed.lastSyncedAt)
    };
  } catch (error) {
    return createDefaultGitHubSyncSettings();
  }
}

function persistGitHubSyncSettings() {
  localStorage.setItem(GITHUB_SYNC_KEY, JSON.stringify(githubSyncSettings));
}

function isValidStatePayload(candidate) {
  return Boolean(
    candidate &&
      Array.isArray(candidate.ideas) &&
      Array.isArray(candidate.currentWork) &&
      Array.isArray(candidate.urgentWork) &&
      Array.isArray(candidate.timeBlocks) &&
      Array.isArray(candidate.papers) &&
      candidate.weeklyReview &&
      typeof candidate.weeklyReview === "object"
  );
}

function getField(form, name) {
  return form.elements.namedItem(name);
}

function createEmptyPaperSections() {
  return PAPER_SECTIONS.reduce((accumulator, section) => {
    accumulator[section.key] = false;
    return accumulator;
  }, {});
}

function upsertById(collection, item) {
  const existingIndex = collection.findIndex((record) => record.id === item.id);
  if (existingIndex === -1) {
    return [item, ...collection];
  }

  const next = [...collection];
  next[existingIndex] = item;
  return next;
}

function renderEmptyState(title, description) {
  return `
    <div class="empty-state">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function setTextIfPresent(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function normalizeViewName(viewName) {
  return VIEW_NAMES.includes(viewName) ? viewName : "";
}

function getViewFromLocationHash() {
  const match = window.location.hash.match(/^#view=([a-zA-Z0-9_-]+)$/);
  return normalizeViewName(match?.[1] || "");
}

function syncViewFromLocation() {
  const viewFromHash = getViewFromLocationHash();
  if (viewFromHash) {
    uiState.activeView = viewFromHash;
  }
}

function ensureViewHistoryState() {
  if (!window.location.hash) {
    updateViewHistory(uiState.activeView, { replace: true });
  }
}

function updateViewHistory(viewName, options = {}) {
  const normalizedView = normalizeViewName(viewName);
  if (!normalizedView) {
    return;
  }

  const nextHash = `#view=${normalizedView}`;
  if (window.location.hash === nextHash && !options.replace) {
    return;
  }

  const method = options.replace ? "replaceState" : "pushState";
  window.history[method]({ view: normalizedView }, "", nextHash);
}

function scrollToElementById(id) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }

  scrollToElement(element);
}

function scrollToView(viewName) {
  const element = document.querySelector(`.view[data-view="${viewName}"]`);
  if (!element) {
    return false;
  }

  scrollToElement(element);
  return true;
}

function scrollToElement(element) {
  if (!element) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const headerHeight = document.querySelector(".site-header")?.offsetHeight || 0;
  const targetTop = Math.max(
    0,
    element.getBoundingClientRect().top + window.scrollY - headerHeight - 24
  );

  window.scrollTo({
    top: targetTop,
    behavior: prefersReducedMotion ? "auto" : "smooth"
  });
}

async function initNativeShell() {
  if (!window.nativeShell?.isNativeApp || typeof window.nativeShell.addBackButtonHandler !== "function") {
    return;
  }

  try {
    await window.nativeShell.addBackButtonHandler(async (_event, controls) => {
      const activeElement = document.activeElement;
      if (activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName)) {
        activeElement.blur();
        return;
      }

      const viewFromHash = getViewFromLocationHash();
      if (viewFromHash && viewFromHash !== VIEW_NAMES[0]) {
        window.history.back();
        return;
      }

      const confirmed = window.confirm("Exit Idea Execution Console?");
      if (confirmed) {
        await controls.exitApp();
      }
    });
  } catch (error) {
    console.error(error);
  }
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function clampNumber(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return min;
  }

  return Math.min(max, Math.max(min, parsed));
}

function createId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;
}

function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

function addDays(dateString, offset) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("en-CA");
}

function startOfWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const weekday = date.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + mondayOffset);
  return date.toLocaleDateString("en-CA");
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || "light";
}

function formatSyncTimestamp(dateString) {
  if (!dateString) {
    return "recently";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateString));
}

function formatLongDate(dateString) {
  if (!dateString) {
    return "No date";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${dateString}T00:00:00`));
}

function formatShortDate(dateString) {
  if (!dateString) {
    return "No deadline";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${dateString}T00:00:00`));
}

function isOverdue(dateString) {
  return Boolean(dateString) && dateString < todayISO();
}

function timeToMinutes(timeString) {
  const [hours = "0", minutes = "0"] = String(timeString).split(":");
  return Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes, 10);
}

function isValidTimeRange(startTime, endTime) {
  return timeToMinutes(endTime) > timeToMinutes(startTime);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
