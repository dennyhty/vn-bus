(() => {
  const cfg = window.VN_BUS_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const demo = params.has("demo");
  const $ = (id) => document.getElementById(id);

  let origins = [];
  let destinations = []; // [[name, path], ...] for the chosen origin
  let current = null;
  let currentPath = "";
  let map = null;
  let layers = null;
  let me = null;
  const mapOps = new Set();
  const geoPoints = []; // { lat, lon, kind, label, addr, op, approx }

  // ---------- helpers ----------
  const vnd = (n) => (n == null ? "" : n.toLocaleString("en-US") + "₫");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Google resolves the address itself, so this is more accurate than our geocoded position.
  const gmapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, Vietnam`)}`;
  const gmapsLink = (address) => `<a class="gmaps" href="${esc(gmapsUrl(address))}" target="_blank" rel="noopener">Google 地圖 ↗</a>`;

  const store = {
    get(k) {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };

  function km(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }
  const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000)} 公尺` : `${d.toFixed(1)} 公里`);
  const toMin = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fmtMin = (m) => {
    const x = ((Math.round(m) % 1440) + 1440) % 1440;
    return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  };
  // Empty bounds mean "no limit"; from > to wraps past midnight (22:00 to 05:00).
  const inRange = (min, from, to) => {
    if (!from && !to) return true;
    if (from && !to) return min >= toMin(from);
    if (!from && to) return min <= toMin(to);
    const a = toMin(from);
    const b = toMin(to);
    return a <= b ? min >= a && min <= b : min >= a || min <= b;
  };
  // Trip length in minutes: the operator's sample trip if it has one, else the route average.
  function tripMinutes(op) {
    const s = op.sample;
    if (s?.date && s?.arriveAt) {
      const d = (Date.parse(s.arriveAt) - Date.parse(s.date)) / 60000;
      if (d > 0 && d < 48 * 60) return d;
    }
    return current?.durationHours ? current.durationHours * 60 : null;
  }
  const vietnamToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

  function setStatus(text, isError) {
    $("status").textContent = text;
    $("status").classList.toggle("error", !!isError);
  }

  // ---------- pickers ----------
  async function loadDestinations(originName) {
    const o = origins.find((x) => x.name.toLowerCase() === originName.trim().toLowerCase());
    destinations = [];
    $("toList").innerHTML = "";
    if (!o) return;
    const res = await fetch(`routes/${o.file}.json`);
    destinations = await res.json();
    $("toList").innerHTML = destinations.map(([n]) => `<option value="${esc(n)}">`).join("");
  }

  function selectedPath() {
    const to = $("to").value.trim().toLowerCase();
    const hit = destinations.find(([n]) => n.toLowerCase() === to);
    return hit ? hit[1] : null;
  }

  // ---------- data ----------
  async function loadRoute(path) {
    if (demo) return (await fetch("demo-route.json")).json();
    if (!cfg.workerUrl || cfg.workerUrl.includes("YOUR-SUBDOMAIN")) {
      throw new Error("還沒設定 Worker 網址（site/config.js）。可以先在網址後面加 ?demo=1 看範例。");
    }
    const res = await fetch(`${cfg.workerUrl}/route?path=${encodeURIComponent(path)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`查詢失敗（${body.error || res.status}），請稍後再試。`);
    return body;
  }

  async function search(e) {
    e?.preventDefault();
    const path = selectedPath();
    if (!path) return setStatus("請從建議清單選擇出發地和目的地（沒有的路線表示 Vexere 沒有這條）。", true);
    $("go").disabled = true;
    setStatus("查詢中…");
    try {
      current = await loadRoute(path);
      currentPath = path;
      mapOps.clear();
      geoPoints.length = 0;
      render();
      setStatus("");
      const q = new URLSearchParams({ from: $("from").value, to: $("to").value });
      if (demo) q.set("demo", "1");
      history.replaceState(null, "", `?${q}`);
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      $("go").disabled = false;
    }
  }

  // ---------- operators ----------
  function render() {
    $("result").hidden = false;
    const f = current.from;
    const t = current.to;
    $("routeName").textContent = `${f?.name ?? $("from").value} → ${t?.name ?? $("to").value}`;
    const bits = [];
    if (f?.nameVi || t?.nameVi) bits.push(`${f?.nameVi ?? ""} → ${t?.nameVi ?? ""}`);
    if (current.distanceKm) bits.push(`${current.distanceKm} 公里`);
    if (current.durationHours) bits.push(`約 ${current.durationHours} 小時`);
    if (current.fareMin) bits.push(`${vnd(current.fareMin)} – ${vnd(current.fareMax)}`);
    bits.push(`${current.totalOperators} 家車行、約 ${current.totalTrips} 班`);
    $("routeMeta").textContent = bits.join(" · ");
    if (!$("liveDate").value) $("liveDate").value = vietnamToday();
    updateLiveLink();
    renderOperators();
    if (!$("tab-map").hidden) renderMap();
  }

  function updateLiveLink() {
    const d = $("liveDate").value || vietnamToday();
    const [y, m, day] = d.split("-");
    $("vexereLink").href = `https://vexere.com/en-US/${currentPath}?date=${day}-${m}-${y}`;
  }

  function addrList(points) {
    if (!points.length) return `<li class="muted">沒有資料</li>`;
    return points.map((p) => `<li>${esc(p.address || p.fullAddress)} ${gmapsLink(p.fullAddress)}<span class="vi">${esc(p.fullAddress)}</span></li>`).join("");
  }

  function renderOperators() {
    const depFrom = $("depFrom").value;
    const depTo = $("depTo").value;
    const arrFrom = $("arrFrom").value;
    const arrTo = $("arrTo").value;
    const filtering = depFrom || depTo || arrFrom || arrTo;
    let ops = current.operators.map((o) => {
      const dur = tripMinutes(o);
      const shown = o.times
        .map((t) => ({ dep: t, arr: dur == null ? null : fmtMin(toMin(t) + dur) }))
        .filter(({ dep, arr }) => inRange(toMin(dep), depFrom, depTo) && ((!arrFrom && !arrTo) || (arr != null && inRange(toMin(arr), arrFrom, arrTo))));
      return { ...o, shown };
    });
    if (filtering) ops = ops.filter((o) => o.shown.length);
    const sorters = {
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.ratingCount - a.ratingCount,
      fare: (a, b) => (a.fareMin ?? 1e12) - (b.fareMin ?? 1e12),
      first: (a, b) => (a.shown[0]?.dep || "99").localeCompare(b.shown[0]?.dep || "99"),
      count: (a, b) => b.shown.length - a.shown.length,
    };
    ops.sort(sorters[$("sort").value]);

    if (!ops.length) {
      $("operators").innerHTML = `<li class="trip muted">沒有符合這個時間範圍的班次。可以放寬或清除時間。</li>`;
      return;
    }
    $("operators").innerHTML = ops
      .map((o) => {
        const fare =
          o.fareMin == null ? "" : o.fareMin === o.fareMax ? vnd(o.fareMin) : `${vnd(o.fareMin)} – ${vnd(o.fareMax)}`;
        const s = o.sample;
        const sample = s
          ? `<div class="sample"><b>範例班次</b>（${esc(String(s.date).slice(0, 10))}，不是今天）：${esc(s.vehicle || "")}，${s.price ? vnd(s.price) : ""}，當時剩 ${s.seatsLeft}/${s.seatsTotal} 位<br>
              上車：${esc(s.from?.name)}${s.from?.nameVi && s.from.nameVi !== s.from.name ? `<span class="op-vi"> (${esc(s.from.nameVi)})</span>` : ""}<br>
              下車：${esc(s.to?.name)}${s.to?.nameVi && s.to.nameVi !== s.to.name ? `<span class="op-vi"> (${esc(s.to.nameVi)})</span>` : ""}</div>`
          : "";
        return `
        <li class="trip">
          <div class="trip-top">
            <div><span class="op-name">${esc(o.name)}</span>${o.nameVi ? `<div class="op-vi">${esc(o.nameVi)}</div>` : ""}</div>
            <div class="fare">${fare}</div>
          </div>
          <div class="meta">${o.rating ? `★ ${o.rating}（${o.ratingCount}）` : "尚無評分"} · 每天 ${o.times.length} 班</div>
          <div class="chips">${o.shown.map(({ dep, arr }) => `<span class="chip" title="抵達時間為推算">${esc(dep)}${arr ? ` <span class="arr">→ ~${esc(arr)}</span>` : ""}</span>`).join("")}</div>
          <details class="op-details">
            <summary>上下車點與範例班次</summary>
            <b>上車點</b><ul class="addr">${addrList(o.pickupPoints)}</ul>
            <b>下車點</b><ul class="addr">${addrList(o.dropoffPoints)}</ul>
            ${sample}
          </details>
          ${
            o.pickupPoints.length + o.dropoffPoints.length
              ? `<button type="button" class="map-btn" data-op="${o.id}">${mapOps.has(o.id) ? "✓ 已在地圖上" : "📍 顯示在地圖"}</button>`
              : `<div class="meta">Vexere 沒有提供這家的上下車點</div>`
          }
        </li>`;
      })
      .join("");
  }

  // ---------- geocoding (addresses only, so positions are approximate) ----------
  let geoQueue = Promise.resolve();
  function geocode(q) {
    const key = "geo:" + q;
    const cached = store.get(key);
    if (cached !== null) return Promise.resolve(cached.miss ? null : cached);
    const task = geoQueue.then(async () => {
      await sleep(1100); // Nominatim allows at most 1 request per second
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(q)}`;
      try {
        const res = await fetch(url);
        const body = await res.json();
        const hit = body[0] ? { lat: Number(body[0].lat), lon: Number(body[0].lon) } : null;
        store.set(key, hit || { miss: true });
        return hit;
      } catch {
        return null;
      }
    });
    geoQueue = task.catch(() => {});
    return task;
  }

  async function locatePoint(p) {
    const full = await geocode(`${p.fullAddress}, Việt Nam`);
    if (full) return { ...full, approx: false };
    const tail = p.fullAddress.split(/\s+/).slice(-4).join(" ");
    const loose = await geocode(`${tail}, Việt Nam`);
    return loose ? { ...loose, approx: true } : null;
  }

  async function addOperatorToMap(op) {
    mapOps.add(op.id);
    const kinds = [
      ["pickup", op.pickupPoints],
      ["dropoff", op.dropoffPoints],
    ];
    let done = 0;
    const total = op.pickupPoints.length + op.dropoffPoints.length;
    for (const [kind, points] of kinds) {
      for (const p of points) {
        if (!mapOps.has(op.id)) return;
        $("mapStatus").textContent = `正在把 ${op.name} 的地址換成地圖位置… ${done}/${total}`;
        const pos = await locatePoint(p);
        done++;
        if (pos) geoPoints.push({ ...pos, kind, op: op.name, opId: op.id, label: p.address || p.fullAddress, addr: p.fullAddress });
        if (!$("tab-map").hidden) renderMap(true);
      }
    }
    $("mapStatus").textContent = "";
  }

  // ---------- map ----------
  function ensureMap() {
    if (map) return;
    map = L.map("map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layers = L.layerGroup().addTo(map);
  }

  async function drawRouteLine(from, to) {
    if (!from?.lat || !to?.lat) return;
    const line = (pts, dashed) =>
      L.polyline(pts, { color: "#0b6bcb", weight: dashed ? 3 : 4, opacity: 0.55, dashArray: dashed ? "6 8" : null }).addTo(layers);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=simplified&geometries=geojson`;
      const body = await (await fetch(url)).json();
      line(body.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]), false);
    } catch {
      line([[from.lat, from.lon], [to.lat, to.lon]], true);
    }
  }

  function renderMap(keepView) {
    ensureMap();
    layers.clearLayers();
    const bounds = [];
    for (const p of current.from?.lat ? [current.from, current.to] : []) {
      if (!p?.lat) continue;
      L.circleMarker([p.lat, p.lon], { radius: 5, color: "#555", weight: 1, fillColor: "#999", fillOpacity: 0.9 }).bindPopup(esc(p.name)).addTo(layers);
      bounds.push([p.lat, p.lon]);
    }
    geoPoints.forEach((p, i) => {
      const color = p.kind === "pickup" ? "#1a9b5a" : "#d64545";
      p.marker = L.circleMarker([p.lat, p.lon], { radius: 8, color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.95 })
        .bindPopup(`<b>${esc(p.op)}</b><br>${p.kind === "pickup" ? "上車點" : "下車點"}：${esc(p.label)}<br><small>${esc(p.addr)}</small><br>${gmapsLink(p.addr)}${p.approx ? "<br><small>位置只到大約的區域</small>" : ""}`)
        .addTo(layers);
      bounds.push([p.lat, p.lon]);
    });
    if (me) {
      L.circleMarker([me.lat, me.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#0b6bcb", fillOpacity: 1 }).bindPopup("我的位置").addTo(layers);
    }
    drawRouteLine(current.from, current.to);
    if (!keepView && bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
    setTimeout(() => map.invalidateSize(), 0);
    renderPointList();
  }

  function renderPointList() {
    const items = geoPoints.map((p, i) => ({ p, i, d: me ? km(me, p) : null }));
    if (me) items.sort((a, b) => a.d - b.d);
    $("pointList").innerHTML = items.length
      ? items
          .map(
            ({ p, i, d }) =>
              `<li data-i="${i}">${p.kind === "pickup" ? "上車" : "下車"}｜${esc(p.op)}｜${esc(p.label)}${p.approx ? ' <span class="approx">約略</span>' : ""}${d != null ? `<span class="dist">${fmtKm(d)}</span>` : ""} ${gmapsLink(p.addr)}</li>`,
          )
          .join("")
      : `<li class="muted" style="list-style:none">先到「車行與時刻」按車行的「顯示在地圖」，這裡才會有點。</li>`;
    if (me && items.length) {
      const near = (kind) => items.filter((x) => x.p.kind === kind)[0];
      const np = near("pickup");
      const nd = near("dropoff");
      $("nearest").textContent = [np && `最近的上車點：${np.p.label}（${np.p.op}，${fmtKm(np.d)}）`, nd && `最近的下車點：${nd.p.label}（${nd.p.op}，${fmtKm(nd.d)}）`]
        .filter(Boolean)
        .join("　");
    } else {
      $("nearest").textContent = "";
    }
  }

  function locate() {
    if (!navigator.geolocation) return setStatus("這個瀏覽器不支援定位。", true);
    $("locate").disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        $("locate").disabled = false;
        renderMap(true);
        map.setView([me.lat, me.lon], 12);
      },
      (err) => {
        $("locate").disabled = false;
        setStatus(`無法取得位置：${err.message}`, true);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function switchTab(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $("tab-operators").hidden = name !== "operators";
    $("tab-map").hidden = name !== "map";
    if (name === "map" && current) renderMap();
  }

  // ---------- time pickers (hour + quarter-hour selects; native pickers can't limit minutes) ----------
  const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
  const QUARTERS = ["00", "15", "30", "45"];
  function buildTimePicker(el) {
    const opts = (list, blank) => (blank ? `<option value="">--</option>` : "") + list.map((v) => `<option>${v}</option>`).join("");
    el.innerHTML = `<select class="th" aria-label="${esc(el.dataset.label)}（時）">${opts(HOURS, true)}</select>:<select class="tm" aria-label="${esc(el.dataset.label)}（分）">${opts(QUARTERS)}</select>`;
    const h = el.querySelector(".th");
    const m = el.querySelector(".tm");
    // Behaves like <input type="time">: "HH:MM" or "" when no hour is chosen.
    Object.defineProperty(el, "value", {
      get: () => (h.value ? `${h.value}:${m.value}` : ""),
      set: (v) => {
        const [hh, mm] = v ? v.split(":") : ["", "00"];
        h.value = hh;
        m.value = QUARTERS.includes(mm) ? mm : "00";
      },
    });
  }
  document.querySelectorAll(".tsel").forEach(buildTimePicker);

  // ---------- wiring ----------
  $("search").addEventListener("submit", search);
  $("from").addEventListener("change", () => {
    $("to").value = "";
    loadDestinations($("from").value);
  });
  $("swap").addEventListener("click", async () => {
    const f = $("from").value;
    const t = $("to").value;
    if (!origins.some((o) => o.name.toLowerCase() === t.trim().toLowerCase())) return setStatus(`「${t}」不在出發地清單裡，沒辦法對調。`, true);
    $("from").value = t;
    await loadDestinations(t);
    $("to").value = f;
    setStatus(destinations.some(([n]) => n.toLowerCase() === f.trim().toLowerCase()) ? "" : `Vexere 沒有 ${t} → ${f} 這條路線。`, !destinations.some(([n]) => n.toLowerCase() === f.trim().toLowerCase()));
  });
  ["depFrom", "depTo", "arrFrom", "arrTo", "sort"].forEach((id) => $(id).addEventListener("change", () => current && renderOperators()));
  $("clearTimes").addEventListener("click", () => {
    ["depFrom", "depTo", "arrFrom", "arrTo"].forEach((id) => ($(id).value = ""));
    if (current) renderOperators();
  });
  $("liveDate").addEventListener("change", updateLiveLink);
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("locate").addEventListener("click", locate);
  $("operators").addEventListener("click", (e) => {
    const btn = e.target.closest(".map-btn");
    if (!btn) return;
    const op = current.operators.find((o) => String(o.id) === btn.dataset.op);
    if (mapOps.has(op.id)) {
      mapOps.delete(op.id);
      for (let i = geoPoints.length - 1; i >= 0; i--) if (geoPoints[i].opId === op.id) geoPoints.splice(i, 1);
      btn.textContent = "📍 顯示在地圖";
    } else {
      btn.textContent = "✓ 已在地圖上（到「上下車點地圖」查看）";
      addOperatorToMap(op);
    }
  });
  $("pointList").addEventListener("click", (e) => {
    if (e.target.closest("a")) return; // let the Google Maps link open without moving the map
    const li = e.target.closest("li[data-i]");
    const p = li && geoPoints[Number(li.dataset.i)];
    if (!p) return;
    map.setView([p.lat, p.lon], 15);
    p.marker?.openPopup();
  });

  fetch("routes/index.json")
    .then((r) => r.json())
    .then(async (list) => {
      origins = list;
      $("fromList").innerHTML = list.map((o) => `<option value="${esc(o.name)}">`).join("");
      if (params.get("from")) {
        $("from").value = params.get("from");
        await loadDestinations(params.get("from"));
        if (params.get("to")) {
          $("to").value = params.get("to");
          if (selectedPath()) search();
        }
      }
    })
    .catch(() => setStatus("讀取路線清單失敗。", true));
})();
