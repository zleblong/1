(function () {
  const defaultCategories = ["肉菜", "素菜", "汤", "主食", "快手菜", "其他"];
  const config = window.APP_CONFIG || {};
  const appName = config.appName || "今天煮什么";
  const categories = Array.isArray(config.categories) && config.categories.length ? config.categories : defaultCategories;
  const storageKeys = {
    unlocked: "dishmate-unlocked",
    dishes: "dishmate-dishes",
    picks: "dishmate-picks",
  };

  const state = {
    unlocked: sessionStorage.getItem(storageKeys.unlocked) === "1" || !config.passcode,
    loading: false,
    syncing: false,
    mode: "local",
    notice: null,
    dishes: [],
    selectedCategory: "全部",
    latestPick: null,
    passcodeError: "",
    form: {
      dishName: "",
      dishCategory: categories[0] || "其他",
    },
  };

  const app = document.getElementById("app");
  const isCloudReady = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  let noticeTimer = null;

  init().catch((error) => {
    console.error(error);
    setNotice("页面启动失败，请检查 config.js 和控制台信息。", "error");
  });

  async function init() {
    if (!state.unlocked) {
      render();
      return;
    }

    await loadData();
    render();
  }

  function render() {
    if (!state.unlocked) {
      app.innerHTML = renderGate();
      bindNotice();
      return;
    }

    const filteredDishes = getFilteredDishes();
    const categoryCounts = getCategoryCounts();
    const currentDish = getCurrentDish();
    const modeLabel = state.mode === "cloud" ? "云端同步" : "本地缓存";
    const modeTone = state.mode === "cloud" ? "success" : "info";
    const summaryTitle = currentDish ? currentDish.name : "今天还没点菜";
    const summaryMeta = currentDish
      ? `${currentDish.category} · ${formatDateTime(state.latestPick?.selected_at)}`
      : "先从下面的菜单里选一道，或者让她直接挑一条。";

    app.innerHTML = `
      <div class="app">
        <header class="app-header">
          <div class="eyebrow">
            <span class="eyebrow-dot"></span>
            <span>${escapeHtml(appName)} · 给两个人的小菜单</span>
          </div>
          <div class="hero">
            <h1>${escapeHtml(appName)}</h1>
            <p>你负责把菜放进来，她负责挑今晚想吃什么。支持手机打开、暗号进入、云端同步和本地缓存，第一版先把好用做扎实。</p>
          </div>
          <div class="status-row">
            <span class="pill pill-${modeTone}"><strong>${modeLabel}</strong> ${isCloudReady ? "Supabase 连接已配置" : "当前在本地模式"} </span>
            <span class="pill"><strong>${state.dishes.length}</strong> 道菜在菜单里</span>
            <span class="pill"><strong>${state.latestPick ? "已选" : "未选"}</strong> 今天的状态</span>
          </div>
          <div class="notice${state.notice ? " is-visible" : ""}" data-tone="${state.notice?.tone || "info"}" role="status" aria-live="polite">
            <span>${escapeHtml(state.notice?.message || "")}</span>
            <button class="button button-secondary button-mini" type="button" data-action="dismiss-notice">知道了</button>
          </div>
        </header>

        <main class="content">
          <section class="summary-grid">
            <div class="panel highlight">
              <div class="big-card">
                <div class="label">今天想吃</div>
                <div>
                  <h2 class="dish-name">${escapeHtml(summaryTitle)}</h2>
                  <div class="dish-meta">${escapeHtml(summaryMeta)}</div>
                </div>
                <div class="action-row">
                  <button class="button button-primary" type="button" data-action="random-pick" ${filteredDishes.length ? "" : "disabled"}>随机点一道</button>
                  <button class="button button-secondary" type="button" data-action="refresh">刷新同步</button>
                  <button class="button button-secondary" type="button" data-action="clear-pick" ${state.latestPick ? "" : "disabled"}>清空今天</button>
                </div>
              </div>
            </div>

            <aside class="panel">
              <div class="panel-header">
                <div>
                  <h2>访问与同步</h2>
                  <p>暗号进入后，数据会优先从云端读取，没有配置时自动退回本地缓存。</p>
                </div>
              </div>
              <div class="section-stack">
                <div class="subpanel">
                  <strong>当前状态</strong>
                  <p>${isCloudReady ? "已接入 Supabase。新增、删除、选择都会同步到云端。" : "还没有填 Supabase 配置，先用本地缓存跑通页面。"} </p>
                </div>
                <div class="subpanel">
                  <strong>今天的选择</strong>
                  <p>${state.latestPick ? `最新选择会保留时间戳。现在这道是 <b>${escapeHtml(summaryTitle)}</b>。` : "还没有记录，点一道菜就会写入。"} </p>
                </div>
              </div>
            </aside>
          </section>

          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>菜单</h2>
                <p>点一个分类，或者直接从列表里选。你也可以随手删掉误加的菜。</p>
              </div>
              <div class="dish-count">${filteredDishes.length} / ${state.dishes.length} 道</div>
            </div>
            <div class="toolbar">
              <div class="filter-row" role="tablist" aria-label="菜品分类筛选">
                ${renderCategoryChips(categoryCounts)}
              </div>
              <div class="action-row">
                <button class="button button-secondary button-mini" type="button" data-action="refresh" ${state.loading ? "disabled" : ""}>${state.loading ? "加载中…" : "同步一次"}</button>
              </div>
            </div>
            <div style="height: 14px"></div>
            ${renderDishList(filteredDishes)}
          </section>

          <section class="section-grid">
            <section class="panel">
              <div class="panel-header">
                <div>
                  <h2>加菜</h2>
                  <p>把你会做的菜慢慢放进来，菜单就会越用越顺手。</p>
                </div>
              </div>
              <form class="form-grid" id="add-dish-form">
                <div class="field">
                  <label for="dish-name">菜名</label>
                  <input id="dish-name" name="dishName" type="text" maxlength="48" placeholder="例如：番茄炒蛋" autocomplete="off" value="${escapeAttr(state.form.dishName)}" required />
                </div>
                <div class="field">
                  <label for="dish-category">分类</label>
                  <select id="dish-category" name="dishCategory">
                    ${categories
                      .map(
                        (category) =>
                          `<option value="${escapeAttr(category)}"${state.form.dishCategory === category ? " selected" : ""}>${escapeHtml(category)}</option>`,
                      )
                      .join("")}
                  </select>
                </div>
                <div class="action-row">
                  <button class="button button-primary" type="submit" ${state.syncing ? "disabled" : ""}>${state.syncing ? "保存中…" : "加入菜单"}</button>
                  <button class="button button-secondary" type="button" data-action="reset-form">清空表单</button>
                </div>
                <div class="helper">如果已经填了 Supabase，新的菜会立刻同步到另一台设备。</div>
              </form>
            </section>

            <section class="panel">
              <div class="panel-header">
                <div>
                  <h2>暗号</h2>
                  <p>这是一个很轻的访问门。想换暗号，直接改 <code>config.js</code> 里的 <code>passcode</code>。</p>
                </div>
              </div>
              <div class="section-stack">
                <div class="subpanel">
                  <strong>当前暗号</strong>
                  <p>${config.passcode ? "已设置" : "未设置"}。如果留空，页面会自动进入。</p>
                </div>
                <div class="subpanel">
                  <strong>建议做法</strong>
                  <p>把这个静态网页部署到你常用的托管服务，再把 Supabase 的地址和匿名 key 填进配置里就行。</p>
                </div>
              </div>
            </section>
          </section>
        </main>
      </div>
    `;

    bindNotice();
    if (document.getElementById("add-dish-form")) {
      const form = document.getElementById("add-dish-form");
      form.dishCategory.value = state.form.dishCategory;
    }
  }

  function renderGate() {
    return `
      <div class="gate">
        <section class="gate-card">
          <div class="eyebrow">
            <span class="eyebrow-dot"></span>
            <span>${escapeHtml(appName)} · 暗号进入</span>
          </div>
          <h2>先说对暗号，再点菜。</h2>
          <p>这个小网页是给你们两个人用的。输入暗号后，就能看菜单、加菜和选今天吃什么。</p>
          <form id="passcode-form" class="form-grid">
            <div class="field">
              <label for="passcode-input">暗号</label>
              <input id="passcode-input" name="passcode" type="password" autocomplete="current-password" placeholder="输入暗号" />
            </div>
            <div class="action-row">
              <button class="button button-primary" type="submit">进入菜单</button>
            </div>
            <div class="helper">如果 <code>config.js</code> 里的暗号留空，页面会直接放行。</div>
            ${state.passcodeError ? `<div class="notice is-visible" data-tone="error" role="status"><span>${escapeHtml(state.passcodeError)}</span></div>` : ""}
          </form>
        </section>
      </div>
    `;
  }

  function renderCategoryChips(categoryCounts) {
    const chips = [
      ["全部", state.dishes.length],
      ...categories.map((category) => [category, categoryCounts[category] || 0]),
    ];
    return chips
      .map(
        ([category, count]) => `
          <button
            class="chip"
            type="button"
            role="tab"
            aria-pressed="${state.selectedCategory === category ? "true" : "false"}"
            data-action="filter-category"
            data-category="${escapeAttr(category)}"
          >
            ${escapeHtml(category)} <span style="opacity: .72">(${count})</span>
          </button>
        `,
      )
      .join("");
  }

  function renderDishList(dishes) {
    if (!dishes.length) {
      return `<div class="empty-state">这个分类还没有菜。先加一道，或者切回“全部”看看别的分类。</div>`;
    }

    return `
      <div class="dish-list">
        ${dishes
          .map(
            (dish) => `
              <article class="dish-card">
                <h3 class="name">${escapeHtml(dish.name)}</h3>
                <div class="meta">
                  <span>${escapeHtml(dish.category)}</span>
                  <span>·</span>
                  <span>${formatDateTime(dish.created_at)}</span>
                </div>
                <div class="actions">
                  <button class="button button-primary button-mini" type="button" data-action="choose-dish" data-dish-id="${dish.id}">今天就吃这个</button>
                  <button class="button button-danger button-mini" type="button" data-action="delete-dish" data-dish-id="${dish.id}">删除</button>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function bindNotice() {
    const notice = app.querySelector(".notice");
    if (!notice) return;
    const dismiss = notice.querySelector('[data-action="dismiss-notice"]');
    if (dismiss) {
      dismiss.addEventListener("click", () => {
        state.notice = null;
        render();
      });
    }
  }

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    if (form.id === "passcode-form") {
      event.preventDefault();
      const input = form.elements.passcode;
      const value = typeof input?.value === "string" ? input.value.trim() : "";
      await unlock(value);
      return;
    }

    if (form.id === "add-dish-form") {
      event.preventDefault();
      const nameInput = form.elements.dishName;
      const categoryInput = form.elements.dishCategory;
      const name = typeof nameInput?.value === "string" ? nameInput.value.trim() : "";
      const category = typeof categoryInput?.value === "string" ? categoryInput.value : categories[0] || "其他";

      if (!name) {
        setNotice("先填一个菜名，再加到菜单里。", "error");
        return;
      }

      await addDish({ name, category });
    }
  });

  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) return;

    const action = target.getAttribute("data-action");
    const dishId = Number(target.getAttribute("data-dish-id"));

    if (action === "filter-category") {
      state.selectedCategory = target.getAttribute("data-category") || "全部";
      render();
      return;
    }

    if (action === "refresh") {
      await loadData();
      render();
      return;
    }

    if (action === "reset-form") {
      state.form.dishName = "";
      state.form.dishCategory = categories[0] || "其他";
      const form = document.getElementById("add-dish-form");
      if (form) form.reset();
      render();
      return;
    }

    if (action === "choose-dish" && Number.isFinite(dishId)) {
      await chooseDish(dishId);
      return;
    }

    if (action === "delete-dish" && Number.isFinite(dishId)) {
      const dish = state.dishes.find((item) => item.id === dishId);
      const ok = window.confirm(`要把「${dish?.name || "这道菜"}」从菜单里删掉吗？`);
      if (!ok) return;
      await deleteDish(dishId);
      return;
    }

    if (action === "clear-pick") {
      await clearPick();
      return;
    }

    if (action === "random-pick") {
      const pool = getFilteredDishes();
      if (!pool.length) return;
      const dish = pool[Math.floor(Math.random() * pool.length)];
      await chooseDish(dish.id);
      return;
    }

    if (action === "dismiss-notice") {
      state.notice = null;
      render();
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    const form = target instanceof Element ? target.closest("form") : null;
    if (!form || form.id !== "add-dish-form") return;

    if (target instanceof HTMLInputElement && target.name === "dishName") {
      state.form.dishName = target.value;
    }

    if (target instanceof HTMLSelectElement && target.name === "dishCategory") {
      state.form.dishCategory = target.value;
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    const form = target instanceof Element ? target.closest("form") : null;
    if (!form || form.id !== "add-dish-form") return;

    if (target instanceof HTMLInputElement && target.name === "dishName") {
      state.form.dishName = target.value;
    }

    if (target instanceof HTMLSelectElement && target.name === "dishCategory") {
      state.form.dishCategory = target.value;
    }
  });

  async function unlock(passcode) {
    if (config.passcode && passcode !== config.passcode) {
      state.passcodeError = "暗号不对，再试一次。";
      render();
      const input = document.getElementById("passcode-input");
      if (input) input.focus();
      return;
    }

    sessionStorage.setItem(storageKeys.unlocked, "1");
    state.unlocked = true;
    state.passcodeError = "";
    await loadData();
    render();
    setNotice("已进入菜单，可以开始点菜了。", "success");
  }

  async function loadData() {
    state.loading = true;
    render();

    try {
      if (isCloudReady) {
        const [remoteDishes, remotePick] = await Promise.all([fetchDishes(), fetchLatestPick()]);
        state.dishes = remoteDishes;
        state.latestPick = remotePick;
        state.mode = "cloud";
        cacheLocalData(remoteDishes, remotePick ? [remotePick] : []);
        setNotice("云端数据已同步。", "success");
      } else {
        const cached = loadLocalData();
        state.dishes = cached.dishes;
        state.latestPick = cached.latestPick;
        state.mode = "local";
        if (!cached.dishes.length) {
          seedLocalData();
          const seeded = loadLocalData();
          state.dishes = seeded.dishes;
          state.latestPick = seeded.latestPick;
        }
      }
    } catch (error) {
      console.error(error);
      const cached = loadLocalData();
      state.dishes = cached.dishes;
      state.latestPick = cached.latestPick;
      state.mode = "local";
      setNotice("云端暂时连不上，先用了本地缓存。", "info");
    } finally {
      state.loading = false;
    }
  }

  async function fetchDishes() {
    const data = await apiRequest("dishes?select=*&order=created_at.asc");
    return Array.isArray(data) ? data.map(normalizeDish) : [];
  }

  async function fetchLatestPick() {
    const data = await apiRequest("meal_picks?select=*&order=selected_at.desc&limit=1");
    if (!Array.isArray(data) || !data.length) return null;
    return normalizePick(data[0]);
  }

  async function addDish({ name, category }) {
    const normalizedName = normalizeName(name);
    const existing = state.dishes.find((dish) => normalizeName(dish.name) === normalizedName);
    if (existing) {
      setNotice("这道菜已经在菜单里了。", "error");
      return;
    }

    state.syncing = true;
    state.form.dishName = name;
    state.form.dishCategory = category;
    render();

    const payload = {
      name,
      category,
      created_at: new Date().toISOString(),
    };

    try {
      if (isCloudReady) {
        await apiRequest("dishes", {
          method: "POST",
          body: JSON.stringify(payload),
          prefer: "return=representation",
        });
        await loadData();
        setNotice(`已加到菜单：${name}`, "success");
      } else {
        const dish = { id: Date.now(), ...payload };
        state.dishes = [...state.dishes, dish];
        cacheLocalData(state.dishes, state.latestPick ? [state.latestPick] : []);
        setNotice(`已加到本地菜单：${name}`, "success");
      }

      state.form.dishName = "";
      state.form.dishCategory = category;
      const form = document.getElementById("add-dish-form");
      if (form) form.reset();
      render();
    } catch (error) {
      console.error(error);
      if (isDuplicateError(error)) {
        setNotice("这道菜已经存在，换个名字试试。", "error");
      } else {
        setNotice("添加失败了，稍后再试一次。", "error");
      }
    } finally {
      state.syncing = false;
      render();
    }
  }

  async function deleteDish(dishId) {
    state.syncing = true;
    render();

    try {
      if (isCloudReady) {
        await apiRequest(`dishes?id=eq.${dishId}`, {
          method: "DELETE",
        });
        await loadData();
        setNotice("已从云端菜单删除。", "success");
      } else {
        state.dishes = state.dishes.filter((dish) => dish.id !== dishId);
        if (state.latestPick && state.latestPick.dish_id === dishId) {
          state.latestPick = null;
        }
        cacheLocalData(state.dishes, state.latestPick ? [state.latestPick] : []);
        setNotice("已从本地菜单删除。", "success");
      }
      render();
    } catch (error) {
      console.error(error);
      setNotice("删除失败了，稍后再试。", "error");
    } finally {
      state.syncing = false;
      render();
    }
  }

  async function chooseDish(dishId) {
    const dish = state.dishes.find((item) => item.id === dishId);
    if (!dish) return;

    state.syncing = true;
    render();

    const pick = {
      dish_id: dishId,
      selected_at: new Date().toISOString(),
    };

    try {
      if (isCloudReady) {
        await apiRequest("meal_picks", {
          method: "POST",
          body: JSON.stringify(pick),
          prefer: "return=representation",
        });
        await loadData();
        setNotice(`今天就吃：${dish.name}`, "success");
      } else {
        state.latestPick = { id: Date.now(), ...pick };
        cacheLocalData(state.dishes, [state.latestPick]);
        setNotice(`今天就吃：${dish.name}`, "success");
      }
      render();
    } catch (error) {
      console.error(error);
      setNotice("选菜失败了，再点一次试试。", "error");
    } finally {
      state.syncing = false;
      render();
    }
  }

  async function clearPick() {
    state.syncing = true;
    render();

    try {
      if (isCloudReady) {
        const pick = state.latestPick;
        if (pick?.id) {
          await apiRequest(`meal_picks?id=eq.${pick.id}`, { method: "DELETE" });
        } else {
          await apiRequest("meal_picks?order=selected_at.desc&limit=1", { method: "DELETE" });
        }
        await loadData();
      } else {
        state.latestPick = null;
        cacheLocalData(state.dishes, []);
      }
      setNotice("今天的选择已清空。", "success");
      render();
    } catch (error) {
      console.error(error);
      setNotice("清空失败了，稍后再试。", "error");
    } finally {
      state.syncing = false;
      render();
    }
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
      method: options.method || "GET",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        "Content-Type": "application/json",
        ...(options.prefer ? { Prefer: options.prefer } : {}),
      },
      body: options.body,
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(text || `Request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }

    if (response.status === 204) return null;

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function loadLocalData() {
    const dishes = parseJSON(localStorage.getItem(storageKeys.dishes), []).map(normalizeDish);
    const picks = parseJSON(localStorage.getItem(storageKeys.picks), []).map(normalizePick);
    return {
      dishes,
      latestPick: picks.length ? picks[picks.length - 1] : null,
    };
  }

  function cacheLocalData(dishes, picks) {
    localStorage.setItem(storageKeys.dishes, JSON.stringify(dishes));
    localStorage.setItem(storageKeys.picks, JSON.stringify(picks));
  }

  function seedLocalData() {
    const seed = [
      { id: 1, name: "番茄炒蛋", category: "肉菜", created_at: new Date().toISOString() },
      { id: 2, name: "清炒时蔬", category: "素菜", created_at: new Date().toISOString() },
      { id: 3, name: "紫菜蛋花汤", category: "汤", created_at: new Date().toISOString() },
    ];
    cacheLocalData(seed, []);
  }

  function getFilteredDishes() {
    if (state.selectedCategory === "全部") return state.dishes;
    return state.dishes.filter((dish) => dish.category === state.selectedCategory);
  }

  function getCategoryCounts() {
    return state.dishes.reduce((counts, dish) => {
      counts[dish.category] = (counts[dish.category] || 0) + 1;
      return counts;
    }, {});
  }

  function getCurrentDish() {
    if (!state.latestPick) return null;
    return state.dishes.find((dish) => dish.id === state.latestPick.dish_id) || null;
  }

  function normalizeDish(dish) {
    return {
      id: Number(dish.id),
      name: String(dish.name || "").trim(),
      category: String(dish.category || "其他").trim() || "其他",
      created_at: dish.created_at || new Date().toISOString(),
    };
  }

  function normalizePick(pick) {
    return {
      id: Number(pick.id),
      dish_id: Number(pick.dish_id),
      selected_at: pick.selected_at || new Date().toISOString(),
    };
  }

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function setNotice(message, tone = "info") {
    state.notice = { message, tone };
    clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      if (state.notice?.message === message) {
        state.notice = null;
        render();
      }
    }, 3500);
    render();
  }

  function parseJSON(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function isDuplicateError(error) {
    return Boolean(error && typeof error === "object" && ("status" in error ? error.status === 409 : false));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }
})();
