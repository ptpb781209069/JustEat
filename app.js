const STORAGE_KEY = "ganfan-machine-state-v2";
const LEGACY_STORAGE_KEY = "ganfan-machine-state-v1";

const mealSlots = [
  { id: "breakfast", label: "早上", short: "早", color: "breakfast" },
  { id: "lunch", label: "中午", short: "中", color: "lunch" },
  { id: "dinner", label: "晚上", short: "晚", color: "dinner" },
];

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const defaultColors = ["#2f8e7d", "#e78a3c", "#596bb3", "#bc5a6f", "#6f8f3d", "#8f68b8"];

let state = loadState();

const weekGrid = document.querySelector("#weekGrid");
const mealPool = document.querySelector("#mealPool");
const drawDayPicker = document.querySelector("#drawDayPicker");
const addDaySelect = document.querySelector("#addDaySelect");
const mealForm = document.querySelector("#mealForm");
const mealIdInput = document.querySelector("#mealIdInput");
const mealNameInput = document.querySelector("#mealNameInput");
const mealColorInput = document.querySelector("#mealColorInput");
const saveMealBtn = document.querySelector("#saveMealBtn");
const cancelEditBtn = document.querySelector("#cancelEditBtn");
const importMealsInput = document.querySelector("#importMealsInput");

function loadState() {
  const fallback = {
    meals: [],
    plan: {},
    drawDays: [0, 1, 2, 3, 4, 5, 6],
    visibleDays: [0, 1, 2, 3, 4, 5, 6],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return normalizeState({ ...fallback, ...saved });

    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    const legacyCustomMeals = (legacy?.meals || []).filter((item) => !/^m\d+$/.test(item.id || ""));
    if (legacyCustomMeals.length) {
      return normalizeState({
        ...fallback,
        meals: legacyCustomMeals.map((item, index) => legacyMealToMeal(item, index)),
        plan: migrateLegacyPlan(legacy.plan || {}, legacyCustomMeals),
      });
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function normalizeState(nextState) {
  return {
    meals: Array.isArray(nextState.meals) ? nextState.meals.map(normalizeMeal).filter(Boolean) : [],
    plan: nextState.plan && typeof nextState.plan === "object" ? nextState.plan : {},
    drawDays: normalizeDayList(nextState.drawDays, [0, 1, 2, 3, 4, 5, 6]),
    visibleDays: normalizeDayList(nextState.visibleDays, [0, 1, 2, 3, 4, 5, 6]),
  };
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
  };
}

function legacyMealToMeal(item, index) {
  return normalizeMeal({
    id: item.id || makeId("legacy"),
    name: item.name,
    type: item.type,
    color: defaultColors[index % defaultColors.length],
  });
}

function migrateLegacyPlan(plan, legacyMeals) {
  const mealsByName = new Map((legacyMeals || []).map((item, index) => [item.name, legacyMealToMeal(item, index)]));
  return Object.fromEntries(
    Object.entries(plan).map(([key, entry]) => {
      const meal = mealsByName.get(entry?.name);
      return [
        key,
        {
          mealId: meal?.id || "",
          name: entry?.name || "",
          color: meal?.color || colorFromText(entry?.name || ""),
          locked: Boolean(entry?.locked),
          source: entry?.source || "draw",
        },
      ];
    }),
  );
}

function saveState() {
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

function chooseMeal(slotId, usedIds) {
  const candidates = state.meals.filter((item) => item.slots.includes(slotId));
  const fresh = candidates.filter((item) => !usedIds.has(item.id));
  const pool = fresh.length ? fresh : candidates;
  const picked = pool[Math.floor(Math.random() * pool.length)];

  if (!picked) {
    return {
      mealId: "",
      name: "暂无候选",
      color: "#d7ddd8",
      source: "empty",
    };
  }

  usedIds.add(picked.id);
  return {
    mealId: picked.id,
    name: picked.name,
    color: picked.color,
    source: "draw",
  };
}

function drawSelectedDays() {
  const days = getWeekDays();
  const selectedDays = state.visibleDays.filter((dayIndex) => state.drawDays.includes(dayIndex));
  const usedIds = new Set(
    Object.values(state.plan)
      .map((entry) => entry?.mealId)
      .filter(Boolean),
  );

  selectedDays.forEach((dayIndex) => {
    const day = days[dayIndex];
    mealSlots.forEach((slot) => {
      const key = slotKey(day.key, slot.id);
      if (state.plan[key]?.locked) return;
      state.plan[key] = chooseMeal(slot.id, usedIds);
    });
  });

  saveState();
  render();
}

function rerollSlot(dayKey, slotId) {
  const usedIds = new Set(
    Object.values(state.plan)
      .map((entry) => entry?.mealId)
      .filter(Boolean),
  );
  state.plan[slotKey(dayKey, slotId)] = chooseMeal(slotId, usedIds);
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
  renderDayPicker();
  renderWeek();
  renderMeals();
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
                <span>${isEmpty ? "没有适用候选" : "来自候选池"}</span>
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

function getPlanEntry(entry) {
  if (!entry) return null;
  const meal = state.meals.find((item) => item.id === entry.mealId);
  if (!meal) return entry;
  return {
    ...entry,
    name: meal.name,
    color: meal.color,
  };
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
          </div>
          <div class="chip-actions">
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
    state.meals = state.meals.map((item) => (item.id === mealId ? { ...item, name, slots, color } : item));
  } else {
    state.meals.unshift({ id: makeId("meal"), name, slots, color });
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
  mealColorInput.value = defaultColors[state.meals.length % defaultColors.length];
  mealForm.querySelectorAll('input[name="mealSlot"]').forEach((input) => {
    input.checked = input.value !== "breakfast";
  });
  saveMealBtn.innerHTML = `<i data-lucide="plus"></i>添加候选`;
  cancelEditBtn.hidden = true;
}

function deleteMeal(id) {
  state.meals = state.meals.filter((item) => item.id !== id);
  Object.keys(state.plan).forEach((key) => {
    if (state.plan[key]?.mealId === id) state.plan[key].mealId = "";
  });
  saveState();
  render();
}

function exportMeals() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    meals: state.meals,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ganfan-meal-pool-${formatDateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
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

function makeId(prefix) {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function colorFromText(text) {
  const seed = [...String(text)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return defaultColors[seed % defaultColors.length];
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
  return escapeHtml(isColor(value) ? value : "#d7ddd8");
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
document.querySelector("#exportMealsBtn").addEventListener("click", exportMeals);
document.querySelector("#importMealsBtn").addEventListener("click", () => importMealsInput.click());
importMealsInput.addEventListener("change", () => importMeals(importMealsInput.files[0]));

mealPool.addEventListener("click", (event) => {
  const editButton = event.target.closest(".edit-meal");
  const deleteButton = event.target.closest(".delete-meal");
  if (editButton) editMeal(editButton.dataset.id);
  if (deleteButton) deleteMeal(deleteButton.dataset.id);
});

resetMealForm();
render();
