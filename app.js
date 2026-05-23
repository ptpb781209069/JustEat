const STORAGE_KEY = "ganfan-machine-state-v3";
const LEGACY_KEYS = ["ganfan-machine-state-v2", "ganfan-machine-state-v1"];
const DEFAULT_TAG_NAME = "普通干饭";

const mealSlots = [
  { id: "breakfast", label: "早上", short: "早", color: "breakfast" },
  { id: "lunch", label: "中午", short: "中", color: "lunch" },
  { id: "dinner", label: "晚上", short: "晚", color: "dinner" },
];

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const defaultColors = [
  "#2f8e7d",
  "#e78a3c",
  "#596bb3",
  "#bc5a6f",
  "#6f8f3d",
  "#8f68b8",
  "#008a60",
  "#c65f32",
  "#327aa6",
  "#8b6a36",
];

let state = loadState();

const weekGrid = document.querySelector("#weekGrid");
const mealPool = document.querySelector("#mealPool");
const drawDayPicker = document.querySelector("#drawDayPicker");
const addDaySelect = document.querySelector("#addDaySelect");
const mealForm = document.querySelector("#mealForm");
const mealIdInput = document.querySelector("#mealIdInput");
const mealNameInput = document.querySelector("#mealNameInput");
const mealColorInput = document.querySelector("#mealColorInput");
const mealTagsInput = document.querySelector("#mealTagsInput");
const saveMealBtn = document.querySelector("#saveMealBtn");
const cancelEditBtn = document.querySelector("#cancelEditBtn");
const importMealsInput = document.querySelector("#importMealsInput");
const importPlanInput = document.querySelector("#importPlanInput");
const tagList = document.querySelector("#tagList");
const tagNameInput = document.querySelector("#tagNameInput");
const tagLimitInput = document.querySelector("#tagLimitInput");

function loadState() {
  const fallback = {
    meals: [],
    plan: {},
    tags: [{ name: DEFAULT_TAG_NAME, limit: null }],
    drawDays: [0, 1, 2, 3, 4, 5, 6],
    visibleDays: [0, 1, 2, 3, 4, 5, 6],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return normalizeState({ ...fallback, ...saved });

    for (const key of LEGACY_KEYS) {
      const legacy = JSON.parse(localStorage.getItem(key));
      if (legacy) return normalizeState({ ...fallback, ...legacy });
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function normalizeState(nextState) {
  const normalized = {
    meals: Array.isArray(nextState.meals) ? nextState.meals.map(normalizeMeal).filter(Boolean) : [],
    plan: nextState.plan && typeof nextState.plan === "object" ? normalizePlan(nextState.plan) : {},
    tags: Array.isArray(nextState.tags) ? nextState.tags.map(normalizeTag).filter(Boolean) : [],
    drawDays: normalizeDayList(nextState.drawDays, [0, 1, 2, 3, 4, 5, 6]),
    visibleDays: normalizeDayList(nextState.visibleDays, [0, 1, 2, 3, 4, 5, 6]),
  };

  ensureKnownTags(normalized);
  return normalized;
}

function normalizeDayList(value, fallback) {
  const list = Array.isArray(value) ? value : fallback;
  const clean = [...new Set(list.map(Number).filter((item) => item >= 0 && item <= 6))];
  return clean.length ? clean.sort((a, b) => a - b) : fallback;
}

function normalizeMeal(item) {
  if (!item?.name) return null;
  const slots = Array.isArray(item.slots)
    ? item.slots
    : item.type === "any"
      ? mealSlots.map((slot) => slot.id)
      : [item.type];

  return {
    id: item.id || makeId("meal"),
    name: String(item.name).trim().slice(0, 32),
    slots: [...new Set(slots.filter((slot) => mealSlots.some((mealSlot) => mealSlot.id === slot)))],
    color: isColor(item.color) ? item.color : colorFromText(item.name),
    tags: normalizeTagNames(item.tags || item.tag || DEFAULT_TAG_NAME),
  };
}

function normalizePlan(plan) {
  return Object.fromEntries(
    Object.entries(plan).map(([key, entry]) => [
      key,
      {
        mealId: entry?.mealId || "",
        name: String(entry?.name || ""),
        color: isColor(entry?.color) ? entry.color : colorFromText(entry?.name || ""),
        tags: normalizeTagNames(entry?.tags || DEFAULT_TAG_NAME),
        locked: Boolean(entry?.locked),
        source: entry?.source || "draw",
      },
    ]),
  );
}

function normalizeTag(item) {
  const name = cleanTagName(typeof item === "string" ? item : item?.name);
  if (!name) return null;
  const rawLimit = typeof item === "object" ? item.limit : null;
  const limit = rawLimit === "" || rawLimit === null || rawLimit === undefined ? null : Math.max(0, Number.parseInt(rawLimit, 10));
  return {
    name,
    limit: Number.isFinite(limit) ? limit : null,
  };
}

function normalizeTagNames(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,，、/]/);
  const tags = source.map(cleanTagName).filter(Boolean);
  return [...new Set(tags.length ? tags : [DEFAULT_TAG_NAME])];
}

function cleanTagName(value) {
  return String(value || "").trim().slice(0, 16);
}

function ensureKnownTags(targetState = state) {
  const tagMap = new Map();
  tagMap.set(DEFAULT_TAG_NAME, { name: DEFAULT_TAG_NAME, limit: null });

  (targetState.tags || []).forEach((tag) => {
    const normalized = normalizeTag(tag);
    if (normalized) tagMap.set(normalized.name, normalized);
  });

  (targetState.meals || []).forEach((meal) => {
    meal.tags.forEach((name) => {
      if (!tagMap.has(name)) tagMap.set(name, { name, limit: null });
    });
  });

  Object.values(targetState.plan || {}).forEach((entry) => {
    (entry?.tags || []).forEach((name) => {
      if (!tagMap.has(name)) tagMap.set(name, { name, limit: null });
    });
  });

  targetState.tags = [...tagMap.values()];
}

function saveState() {
  ensureKnownTags();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getWeekDays() {
  const today = new Date();
  const day = today.getDay() || 7;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() - day + 1);

  return dayNames.map((name, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      index,
      name,
      date,
      key: formatDateKey(date),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
    };
  });
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function slotKey(dayKey, slotId) {
  return `${dayKey}:${slotId}`;
}

function getPlanEntry(entry) {
  if (!entry) return null;
  const meal = state.meals.find((item) => item.id === entry.mealId);
  if (!meal) return entry;
  return {
    ...entry,
    name: meal.name,
    color: meal.color,
    tags: meal.tags,
  };
}

function drawSelectedDays() {
  const days = getWeekDays();
  const selectedDays = state.visibleDays.filter((dayIndex) => state.drawDays.includes(dayIndex));
  const redrawKeys = new Set();

  selectedDays.forEach((dayIndex) => {
    const day = days[dayIndex];
    mealSlots.forEach((slot) => {
      const key = slotKey(day.key, slot.id);
      if (!state.plan[key]?.locked) redrawKeys.add(key);
    });
  });

  const usedIds = new Set();
  const tagCounts = new Map();
  Object.entries(state.plan).forEach(([key, rawEntry]) => {
    if (redrawKeys.has(key)) return;
    const entry = getPlanEntry(rawEntry);
    if (!entry || entry.source === "empty") return;
    if (entry.mealId) usedIds.add(entry.mealId);
    addTagsToCount(entry.tags, tagCounts);
  });

  redrawKeys.forEach((key) => {
    const slotId = key.split(":").at(-1);
    state.plan[key] = chooseMeal(slotId, usedIds, tagCounts);
  });

  saveState();
  render();
}

function chooseMeal(slotId, usedIds, tagCounts) {
  const candidates = state.meals.filter((item) => item.slots.includes(slotId));
  let pool = candidates.filter((item) => !usedIds.has(item.id) && canUseTags(item.tags, tagCounts));
  if (!pool.length) pool = candidates.filter((item) => canUseTags(item.tags, tagCounts));

  const picked = pool[Math.floor(Math.random() * pool.length)];
  if (!picked) {
    return {
      mealId: "",
      name: candidates.length ? "标签次数已满" : "暂无候选",
      color: "#d7ddd8",
      tags: [],
      source: "empty",
    };
  }

  usedIds.add(picked.id);
  addTagsToCount(picked.tags, tagCounts);
  return {
    mealId: picked.id,
    name: picked.name,
    color: picked.color,
    tags: picked.tags,
    source: "draw",
  };
}

function addTagsToCount(tags, tagCounts) {
  normalizeTagNames(tags).forEach((tag) => {
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  });
}

function canUseTags(tags, tagCounts) {
  return normalizeTagNames(tags).every((tagName) => {
    const setting = state.tags.find((tag) => tag.name === tagName);
    if (!setting || setting.limit === null) return true;
    return (tagCounts.get(tagName) || 0) < setting.limit;
  });
}

function currentTagCounts() {
  const counts = new Map();
  Object.values(state.plan).forEach((rawEntry) => {
    const entry = getPlanEntry(rawEntry);
    if (!entry || entry.source === "empty") return;
    addTagsToCount(entry.tags, counts);
  });
  return counts;
}

function rerollSlot(dayKey, slotId) {
  const keyToReplace = slotKey(dayKey, slotId);
  const usedIds = new Set();
  const tagCounts = new Map();

  Object.entries(state.plan).forEach(([key, rawEntry]) => {
    if (key === keyToReplace) return;
    const entry = getPlanEntry(rawEntry);
    if (!entry || entry.source === "empty") return;
    if (entry.mealId) usedIds.add(entry.mealId);
    addTagsToCount(entry.tags, tagCounts);
  });

  state.plan[keyToReplace] = chooseMeal(slotId, usedIds, tagCounts);
  saveState();
  render();
}

function toggleLock(dayKey, slotId) {
  const key = slotKey(dayKey, slotId);
  const entry = state.plan[key];
  if (!entry || entry.source === "empty") return;
  entry.locked = !entry.locked;
  saveState();
  render();
}

function clearPlan() {
  state.plan = {};
  saveState();
  render();
}

function removeDay(dayIndex) {
  if (state.visibleDays.length <= 1) return;
  state.visibleDays = state.visibleDays.filter((item) => item !== dayIndex);
  state.drawDays = state.drawDays.filter((item) => item !== dayIndex);
  saveState();
  render();
}

function addDay(dayIndex) {
  if (Number.isNaN(dayIndex)) return;
  state.visibleDays = normalizeDayList([...state.visibleDays, dayIndex], state.visibleDays);
  state.drawDays = normalizeDayList([...state.drawDays, dayIndex], state.drawDays);
  saveState();
  render();
}

function setDrawDay(dayIndex, checked) {
  state.drawDays = checked
    ? normalizeDayList([...state.drawDays, dayIndex], state.drawDays)
    : state.drawDays.filter((item) => item !== dayIndex);
  saveState();
}

function render() {
  ensureKnownTags();
  renderDayPicker();
  renderWeek();
  renderMeals();
  renderTags();
  renderAddDaySelect();
  if (window.lucide) window.lucide.createIcons();
}

function renderDayPicker() {
  drawDayPicker.innerHTML = state.visibleDays
    .map(
      (dayIndex) => `
        <label class="day-check">
          <input type="checkbox" data-day="${dayIndex}" ${state.drawDays.includes(dayIndex) ? "checked" : ""} />
          <span>${dayNames[dayIndex]}</span>
        </label>
      `,
    )
    .join("");
}

function renderAddDaySelect() {
  const hiddenDays = dayNames
    .map((name, index) => ({ name, index }))
    .filter((day) => !state.visibleDays.includes(day.index));

  addDaySelect.innerHTML = [
    `<option value="">选择</option>`,
    ...hiddenDays.map((day) => `<option value="${day.index}">${day.name}</option>`),
  ].join("");
  addDaySelect.disabled = hiddenDays.length === 0;
}

function renderWeek() {
  const days = getWeekDays();
  weekGrid.style.setProperty("--visible-days", state.visibleDays.length);
  weekGrid.innerHTML = state.visibleDays
    .map((dayIndex) => {
      const day = days[dayIndex];
      const slots = mealSlots
        .map((slot) => {
          const entry = getPlanEntry(state.plan[slotKey(day.key, slot.id)]);
          const color = entry?.color || "#d7ddd8";
          const isEmpty = !entry || entry.source === "empty";
          return `
            <article class="meal-slot ${isEmpty ? "is-empty" : ""}" style="--meal-color: ${escapeAttr(color)}" data-day="${day.key}" data-slot="${slot.id}">
              <div class="slot-head">
                <span class="slot-label"><b class="dot ${slot.color}"></b>${slot.label}</span>
                <span class="slot-actions">
                  <button class="mini-button reroll" type="button" title="重抽这一餐" aria-label="重抽${day.name}${slot.label}">
                    <i data-lucide="refresh-cw"></i>
                  </button>
                  <button class="mini-button lock ${entry?.locked ? "active" : ""}" type="button" title="锁定这一餐" aria-label="锁定${day.name}${slot.label}">
                    <i data-lucide="${entry?.locked ? "lock" : "unlock"}"></i>
                  </button>
                </span>
              </div>
              <p class="meal-name">${escapeHtml(entry?.name || "待抽取")}</p>
              <div class="meal-color-row">
                <span class="color-swatch" style="background:${escapeAttr(color)}"></span>
                <span>${isEmpty ? escapeHtml(entry?.name || "没有抽取结果") : escapeHtml((entry.tags || []).join(" / "))}</span>
              </div>
            </article>
          `;
        })
        .join("");

      return `
        <section class="day-column">
          <div class="day-title">
            <div>
              <h3>${day.name}</h3>
              <p>${day.label}</p>
            </div>
            <button class="mini-button remove-day" type="button" data-day="${day.index}" title="删除这一天" aria-label="删除${day.name}">
              <i data-lucide="x"></i>
            </button>
          </div>
          ${slots}
        </section>
      `;
    })
    .join("");
}

function renderMeals() {
  if (!state.meals.length) {
    mealPool.innerHTML = `<p class="empty-state">候选池为空。添加几道饭，或导入之前导出的 JSON。</p>`;
    return;
  }

  mealPool.innerHTML = state.meals
    .map(
      (item) => `
        <div class="meal-chip" style="--meal-color: ${escapeAttr(item.color)}">
          <span class="color-block" aria-hidden="true"></span>
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${item.slots.map(typeLabel).join(" / ")}</span>
            <div class="chip-tags">
              ${item.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
            </div>
          </div>
          <div class="chip-actions">
            <button class="delete-button copy-meal" type="button" data-id="${item.id}" title="复制候选" aria-label="复制${escapeHtml(item.name)}">
              <i data-lucide="copy"></i>
            </button>
            <button class="delete-button edit-meal" type="button" data-id="${item.id}" title="编辑候选" aria-label="编辑${escapeHtml(item.name)}">
              <i data-lucide="pencil"></i>
            </button>
            <button class="delete-button delete-meal" type="button" data-id="${item.id}" title="删除候选" aria-label="删除${escapeHtml(item.name)}">
              <i data-lucide="x"></i>
            </button>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderTags() {
  const counts = currentTagCounts();
  tagList.innerHTML = state.tags
    .map((tag) => {
      const count = counts.get(tag.name) || 0;
      const limitText = tag.limit === null ? "不限" : `最多 ${tag.limit} 次`;
      return `
        <div class="tag-item">
          <div>
            <strong>${escapeHtml(tag.name)}</strong>
            <small>当前结果 ${count} 次 · ${limitText}</small>
          </div>
          <input class="tag-limit-input" data-name="${escapeAttr(tag.name)}" type="number" min="0" inputmode="numeric" value="${tag.limit ?? ""}" placeholder="不限" title="最多出现次数" />
          <button class="delete-button delete-tag" type="button" data-name="${escapeAttr(tag.name)}" title="删除标签" aria-label="删除${escapeHtml(tag.name)}" ${tag.name === DEFAULT_TAG_NAME ? "disabled" : ""}>
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
    })
    .join("");
}

function typeLabel(type) {
  return (
    {
      breakfast: "早",
      lunch: "中",
      dinner: "晚",
    }[type] || type
  );
}

function saveMeal(event) {
  event.preventDefault();
  const name = mealNameInput.value.trim().slice(0, 32);
  const slots = [...mealForm.querySelectorAll('input[name="mealSlot"]:checked')].map((input) => input.value);
  const color = mealColorInput.value;
  const tags = normalizeTagNames(mealTagsInput.value);

  if (!name) {
    mealNameInput.focus();
    return;
  }

  if (!slots.length) {
    mealForm.querySelector('input[name="mealSlot"]').focus();
    return;
  }

  const mealId = mealIdInput.value;
  if (mealId) {
    state.meals = state.meals.map((item) => (item.id === mealId ? { ...item, name, slots, color, tags } : item));
  } else {
    state.meals.unshift({ id: makeId("meal"), name, slots, color, tags });
  }

  resetMealForm();
  saveState();
  render();
}

function editMeal(id) {
  const meal = state.meals.find((item) => item.id === id);
  if (!meal) return;

  mealIdInput.value = meal.id;
  mealNameInput.value = meal.name;
  mealColorInput.value = meal.color;
  mealTagsInput.value = meal.tags.join(", ");
  mealForm.querySelectorAll('input[name="mealSlot"]').forEach((input) => {
    input.checked = meal.slots.includes(input.value);
  });
  saveMealBtn.innerHTML = `<i data-lucide="check"></i>保存修改`;
  cancelEditBtn.hidden = false;
  mealNameInput.focus();
  if (window.lucide) window.lucide.createIcons();
}

function resetMealForm() {
  mealIdInput.value = "";
  mealNameInput.value = "";
  mealTagsInput.value = DEFAULT_TAG_NAME;
  mealColorInput.value = defaultColors[state.meals.length % defaultColors.length];
  mealForm.querySelectorAll('input[name="mealSlot"]').forEach((input) => {
    input.checked = input.value !== "breakfast";
  });
  saveMealBtn.innerHTML = `<i data-lucide="plus"></i>添加候选`;
  cancelEditBtn.hidden = true;
  if (window.lucide) window.lucide.createIcons();
}

function copyMeal(id) {
  const meal = state.meals.find((item) => item.id === id);
  if (!meal) return;
  const copy = {
    ...meal,
    id: makeId("meal"),
    tags: [...meal.tags],
    slots: [...meal.slots],
  };
  const index = state.meals.findIndex((item) => item.id === id);
  state.meals.splice(index + 1, 0, copy);
  saveState();
  render();
}

function deleteMeal(id) {
  state.meals = state.meals.filter((item) => item.id !== id);
  Object.keys(state.plan).forEach((key) => {
    if (state.plan[key]?.mealId === id) state.plan[key].mealId = "";
  });
  saveState();
  render();
}

function addTag() {
  const name = cleanTagName(tagNameInput.value);
  if (!name) {
    tagNameInput.focus();
    return;
  }

  const limit = parseLimit(tagLimitInput.value);
  const existing = state.tags.find((tag) => tag.name === name);
  if (existing) {
    existing.limit = limit;
  } else {
    state.tags.push({ name, limit });
  }

  tagNameInput.value = "";
  tagLimitInput.value = "";
  saveState();
  render();
}

function updateTagLimit(name, value) {
  const tag = state.tags.find((item) => item.name === name);
  if (!tag) return;
  tag.limit = parseLimit(value);
  saveState();
  renderTags();
}

function deleteTag(name) {
  if (name === DEFAULT_TAG_NAME) return;
  state.tags = state.tags.filter((tag) => tag.name !== name);
  state.meals = state.meals.map((meal) => {
    const tags = meal.tags.filter((tag) => tag !== name);
    return { ...meal, tags: tags.length ? tags : [DEFAULT_TAG_NAME] };
  });
  Object.values(state.plan).forEach((entry) => {
    entry.tags = normalizeTagNames((entry.tags || []).filter((tag) => tag !== name));
  });
  saveState();
  render();
}

function parseLimit(value) {
  if (value === "" || value === null || value === undefined) return null;
  const limit = Number.parseInt(value, 10);
  return Number.isFinite(limit) ? Math.max(0, limit) : null;
}

function autoAssignColors() {
  const colorByName = new Map();
  state.meals = state.meals.map((meal) => {
    if (!colorByName.has(meal.name)) colorByName.set(meal.name, colorFromText(meal.name));
    return { ...meal, color: colorByName.get(meal.name) };
  });
  Object.keys(state.plan).forEach((key) => {
    const entry = getPlanEntry(state.plan[key]);
    state.plan[key].color = entry?.color || state.plan[key].color;
  });
  saveState();
  render();
}

function exportMeals() {
  const payload = {
    version: 3,
    exportedAt: new Date().toISOString(),
    tags: state.tags,
    meals: state.meals,
  };
  downloadText(`ganfan-meal-pool-${formatDateKey(new Date())}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function importMeals(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const payload = JSON.parse(reader.result);
      const imported = Array.isArray(payload) ? payload : payload.meals;
      const meals = imported.map(normalizeMeal).filter(Boolean);
      if (!meals.length) throw new Error("empty");
      state.meals = meals;
      state.tags = Array.isArray(payload.tags) ? payload.tags.map(normalizeTag).filter(Boolean) : state.tags;
      resetMealForm();
      saveState();
      render();
    } catch {
      window.alert("导入失败，请选择干饭机器导出的 JSON 文件。");
    } finally {
      importMealsInput.value = "";
    }
  });
  reader.readAsText(file);
}

function exportPlanJson() {
  const payload = {
    version: 3,
    exportedAt: new Date().toISOString(),
    tags: state.tags,
    meals: state.meals,
    plan: readablePlanRows(),
  };
  downloadText(`ganfan-plan-${formatDateKey(new Date())}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function exportPlanCsv() {
  const rows = readablePlanRows();
  const header = ["日期", "星期", "餐段", "名称", "标签", "颜色", "来源", "锁定"];
  const csv = [header, ...rows.map((row) => [row.date, row.day, row.slot, row.name, row.tags.join("|"), row.color, row.source, row.locked ? "是" : "否"])]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  downloadText(`ganfan-plan-${formatDateKey(new Date())}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
}

function readablePlanRows() {
  const days = getWeekDays();
  const rows = [];
  state.visibleDays.forEach((dayIndex) => {
    const day = days[dayIndex];
    mealSlots.forEach((slot) => {
      const entry = getPlanEntry(state.plan[slotKey(day.key, slot.id)]);
      if (!entry || entry.source === "empty") return;
      rows.push({
        date: day.key,
        day: day.name,
        slot: slot.label,
        slotId: slot.id,
        name: entry.name,
        tags: normalizeTagNames(entry.tags),
        color: entry.color,
        source: entry.source || "draw",
        locked: Boolean(entry.locked),
      });
    });
  });
  return rows;
}

function exportPlanImage() {
  const rows = readablePlanRows();
  const days = getWeekDays().filter((day) => state.visibleDays.includes(day.index));
  const scale = 2;
  const cellWidth = 210;
  const headerHeight = 64;
  const slotHeight = 92;
  const width = Math.max(760, days.length * cellWidth + 48);
  const height = headerHeight + 42 + mealSlots.length * slotHeight + 36;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#fffdfa";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1d2523";
  ctx.font = "700 28px Microsoft YaHei, sans-serif";
  ctx.fillText("干饭机器本周结果", 24, 40);
  ctx.font = "14px Microsoft YaHei, sans-serif";
  ctx.fillStyle = "#65706c";
  ctx.fillText(`导出时间 ${new Date().toLocaleString("zh-CN")}`, 260, 39);

  days.forEach((day, dayOffset) => {
    const x = 24 + dayOffset * cellWidth;
    ctx.fillStyle = "#eef6f1";
    roundRect(ctx, x, headerHeight, cellWidth - 8, 34, 8);
    ctx.fill();
    ctx.fillStyle = "#1d2523";
    ctx.font = "700 15px Microsoft YaHei, sans-serif";
    ctx.fillText(`${day.name} ${day.label}`, x + 12, headerHeight + 22);

    mealSlots.forEach((slot, slotIndex) => {
      const y = headerHeight + 42 + slotIndex * slotHeight;
      const entry = rows.find((row) => row.date === day.key && row.slotId === slot.id);
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, x, y, cellWidth - 8, slotHeight - 8, 8);
      ctx.fill();
      ctx.strokeStyle = "#d8ddd7";
      ctx.stroke();

      ctx.fillStyle = entry?.color || "#d7ddd8";
      roundRect(ctx, x, y, 7, slotHeight - 8, 8);
      ctx.fill();
      ctx.fillStyle = "#65706c";
      ctx.font = "700 13px Microsoft YaHei, sans-serif";
      ctx.fillText(slot.label, x + 16, y + 24);
      ctx.fillStyle = "#1d2523";
      ctx.font = "700 16px Microsoft YaHei, sans-serif";
      wrapCanvasText(ctx, entry?.name || "待抽取", x + 16, y + 50, cellWidth - 40, 20, 2);
    });
  });

  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(`ganfan-plan-${formatDateKey(new Date())}.png`, blob);
  }, "image/png");
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = [...String(text)];
  let line = "";
  let lines = 0;
  chars.forEach((char, index) => {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines += 1;
      line = char;
    } else {
      line = test;
    }
    if (index === chars.length - 1 && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
  });
}

function importPlan(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const text = String(reader.result || "");
      const rows = file.name.toLowerCase().endsWith(".json") ? parsePlanJson(text) : parsePlanCsv(text);
      if (!rows.length) throw new Error("empty");
      applyImportedPlanRows(rows);
      saveState();
      render();
    } catch {
      window.alert("导入失败，请使用干饭机器导出的 JSON/CSV，或包含“日期、星期、餐段、名称”的表格。");
    } finally {
      importPlanInput.value = "";
    }
  });
  reader.readAsText(file);
}

function parsePlanJson(text) {
  const payload = JSON.parse(text);
  return Array.isArray(payload) ? payload : payload.plan || [];
}

function parsePlanCsv(text) {
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  if (lines.length < 2) return [];
  const headers = lines[0];
  return lines.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function applyImportedPlanRows(rows) {
  const days = getWeekDays();
  rows.forEach((row) => {
    const name = String(row.name || row["名称"] || "").trim();
    if (!name) return;

    const slotId = normalizeSlotId(row.slotId || row["餐段"] || row.slot);
    if (!slotId) return;

    const dayIndex = normalizeDayIndex(row.date || row["日期"], row.day || row["星期"]);
    if (dayIndex === null) return;

    const tags = normalizeTagNames(row.tags || row["标签"] || DEFAULT_TAG_NAME);
    const color = isColor(row.color || row["颜色"]) ? row.color || row["颜色"] : colorFromText(name);
    let meal = state.meals.find((item) => item.name === name && item.slots.includes(slotId));
    if (!meal) {
      meal = { id: makeId("meal"), name: name.slice(0, 32), slots: [slotId], color, tags };
      state.meals.unshift(meal);
    }

    const day = days[dayIndex];
    if (!state.visibleDays.includes(dayIndex)) state.visibleDays = normalizeDayList([...state.visibleDays, dayIndex], state.visibleDays);
    state.plan[slotKey(day.key, slotId)] = {
      mealId: meal.id,
      name: meal.name,
      color: meal.color,
      tags: meal.tags,
      locked: String(row.locked || row["锁定"] || "").includes("是") || Boolean(row.locked === true),
      source: "import",
    };
  });
}

function normalizeSlotId(value) {
  const text = String(value || "");
  if (mealSlots.some((slot) => slot.id === text)) return text;
  if (/早/.test(text)) return "breakfast";
  if (/中|午/.test(text)) return "lunch";
  if (/晚|夜/.test(text)) return "dinner";
  return "";
}

function normalizeDayIndex(dateValue, dayValue) {
  const days = getWeekDays();
  const dateText = String(dateValue || "");
  const byDate = days.find((day) => day.key === dateText || day.label === dateText);
  if (byDate) return byDate.index;
  const dayText = String(dayValue || dateValue || "");
  const byName = dayNames.findIndex((name) => dayText.includes(name));
  return byName >= 0 ? byName : null;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(filename, content, type) {
  downloadBlob(filename, new Blob([content], { type }));
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function makeId(prefix) {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function colorFromText(text) {
  let hash = 0;
  [...String(text)].forEach((char) => {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  });
  const hue = hash % 360;
  return hslToHex(hue, 48, 45);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((value) => Math.round(255 * value).toString(16).padStart(2, "0")).join("")}`;
}

function isColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

function escapeAttr(value) {
  return escapeHtml(value || "");
}

document.querySelector("#drawSelectedBtn").addEventListener("click", drawSelectedDays);
document.querySelector("#clearPlanBtn").addEventListener("click", clearPlan);
document.querySelector("#selectAllDaysBtn").addEventListener("click", () => {
  state.drawDays = [...state.visibleDays];
  saveState();
  render();
});
document.querySelector("#selectWorkdaysBtn").addEventListener("click", () => {
  state.drawDays = state.visibleDays.filter((dayIndex) => dayIndex < 5);
  saveState();
  render();
});
document.querySelector("#exportMealsBtn").addEventListener("click", exportMeals);
document.querySelector("#importMealsBtn").addEventListener("click", () => importMealsInput.click());
document.querySelector("#autoColorBtn").addEventListener("click", autoAssignColors);
document.querySelector("#mealAutoColorBtn").addEventListener("click", () => {
  mealColorInput.value = colorFromText(mealNameInput.value || DEFAULT_TAG_NAME);
});
document.querySelector("#exportImageBtn").addEventListener("click", exportPlanImage);
document.querySelector("#exportTableBtn").addEventListener("click", exportPlanCsv);
document.querySelector("#exportPlanBtn").addEventListener("click", exportPlanJson);
document.querySelector("#importPlanBtn").addEventListener("click", () => importPlanInput.click());
document.querySelector("#addTagBtn").addEventListener("click", addTag);

drawDayPicker.addEventListener("change", (event) => {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;
  setDrawDay(Number(input.dataset.day), input.checked);
});

addDaySelect.addEventListener("change", () => {
  addDay(Number(addDaySelect.value));
});

weekGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.classList.contains("remove-day")) {
    removeDay(Number(button.dataset.day));
    return;
  }

  const slotEl = button.closest(".meal-slot");
  if (!slotEl) return;
  const { day, slot } = slotEl.dataset;
  if (button.classList.contains("reroll")) rerollSlot(day, slot);
  if (button.classList.contains("lock")) toggleLock(day, slot);
});

mealForm.addEventListener("submit", saveMeal);
cancelEditBtn.addEventListener("click", resetMealForm);
importMealsInput.addEventListener("change", () => importMeals(importMealsInput.files[0]));
importPlanInput.addEventListener("change", () => importPlan(importPlanInput.files[0]));
tagNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addTag();
});
tagLimitInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addTag();
});

mealPool.addEventListener("click", (event) => {
  const copyButton = event.target.closest(".copy-meal");
  const editButton = event.target.closest(".edit-meal");
  const deleteButton = event.target.closest(".delete-meal");
  if (copyButton) copyMeal(copyButton.dataset.id);
  if (editButton) editMeal(editButton.dataset.id);
  if (deleteButton) deleteMeal(deleteButton.dataset.id);
});

tagList.addEventListener("change", (event) => {
  const input = event.target.closest(".tag-limit-input");
  if (!input) return;
  updateTagLimit(input.dataset.name, input.value);
});

tagList.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-tag");
  if (!button) return;
  deleteTag(button.dataset.name);
});

resetMealForm();
render();
