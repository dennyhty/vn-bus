(() => {
  const cfg = window.VN_BUS_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const demo = params.has("demo");
  const $ = (id) => document.getElementById(id);

  let routes = [];
  let current = null;
  let map = null;
  let layers = null;
  let me = null;

  // ---------- helpers ----------
  const vnd = (n) => (n == null ? "" : n.toLocaleString("en-US") + "₫");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function km(a, b) {
    const R = 6371;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000)} 公尺` : `${d.toFixed(1)} 公里`);

  function setStatus(text, isError) {
    $("status").textContent = text;
    $("status").classList.toggle("error", !!isError);
  }

  // ---------- route pickers ----------
  function fillFrom() {
    const froms = [...new Set(routes.map((r) => r.from))].sort();
    $("from").innerHTML = froms.map((f) => `<option>${esc(f)}</option>`).join("");
  }

  function fillTo(preferred) {
    const from = $("from").value;
    const tos = routes.filter((r) => r.from === from).map((r) => r.to).sort();
    $("to").innerHTML = tos.map((t) => `<option>${esc(t)}</option>`).join("");
    if (preferred && tos.includes(preferred)) $("to").value = preferred;
  }

  function selectedRoute() {
    return routes.find((r) => r.from === $("from").value && r.to === $("to").value);
  }

  // ---------- data ----------
  async function loadRoute(route) {
    if (demo) {
      const res = await fetch("demo-route.json");
      return res.json();
    }
    if (!cfg.workerUrl || cfg.workerUrl.includes("YOUR-SUBDOMAIN")) {
      throw new Error("還沒設定 Worker 網址（site/config.js）。可以先在網址後面加 ?demo=1 看範例。");
    }
    const res = await fetch(`${cfg.workerUrl}/route?path=${encodeURIComponent(route.path)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`查詢失敗（${body.error || res.status}），請稍後再試。`);
    return body;
  }

  async function search(e) {
    e?.preventDefault();
    const route = selectedRoute();
    if (!route) return;
    $("go").disabled = true;
    setStatus("查詢中…");
    try {
      current = await loadRoute(route);
      current.path = route.path;
      render();
      setStatus("");
      const q = new URLSearchParams({ from: route.from, to: route.to });
      if (demo) q.set("demo", "1");
      history.replaceState(null, "", `?${q}`);
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      $("go").disabled = false;
    }
  }

  // ---------- trips ----------
  function render() {
    $("result").hidden = false;
    $("routeName").textContent = `${current.from?.name ?? ""} → ${current.to?.name ?? ""}`;
    const date = current.date ? current.date.slice(0, 10) : "";
    const total = current.totalTrips ? `，這天共約 ${current.totalTrips} 班` : "";
    const fetched = current.fetchedAt ? `，更新於 ${new Date(current.fetchedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}` : "";
    $("routeMeta").textContent = ` ${date}${total}${fetched}`;
    $("vexereLink").href = current.sourceUrl || `https://vexere.com/en-US/${current.path}`;
    renderTrips();
    if (!$("tab-map").hidden) renderMap();
    else if (map) layers?.clearLayers();
  }

  function renderTrips() {
    const now = Date.now();
    let trips = current.trips.map((t) => ({ ...t, departed: t.departAt && Date.parse(t.departAt) < now }));
    if ($("hideDeparted").checked) trips = trips.filter((t) => !t.departed);
    if ($("hideSoldOut").checked) trips = trips.filter((t) => t.seatsLeft > 0);
    const sorters = {
      time: (a, b) => Date.parse(a.departAt) - Date.parse(b.departAt),
      price: (a, b) => a.price - b.price,
      seats: (a, b) => b.seatsLeft - a.seatsLeft,
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    };
    trips.sort(sorters[$("sort").value]);

    if (!trips.length) {
      $("trips").innerHTML = `<li class="trip muted">沒有符合條件的班次。可以取消上面的篩選，或到 Vexere 查看更多班次。</li>`;
      return;
    }
    $("trips").innerHTML = trips
      .map(
        (t) => `
      <li class="trip${t.departed ? " departed" : ""}">
        <div class="trip-top">
          <div class="times">${esc(t.departTime)} → ${esc(t.arriveTime)}<span class="dur">${esc(t.duration)}</span></div>
          <div class="price">${t.originalPrice > t.price ? `<s>${vnd(t.originalPrice)}</s>` : ""}${vnd(t.price)}</div>
        </div>
        <div><span class="op">${esc(t.operator)}</span> · ${esc(t.vehicle)}</div>
        <div class="meta">
          <span class="${t.seatsLeft <= 3 ? "seats-low" : ""}">剩 ${t.seatsLeft}/${t.seatsTotal} 位</span>
          ${t.rating ? ` · ★ ${t.rating}（${t.ratingCount}）` : ""}
          ${t.refundable ? " · 可退票" : ""}
          ${t.departed ? " · 已發車" : ""}
        </div>
        <div class="stops">
          <div><b>上車</b>${esc(t.pickup.name)}</div>
          <div><b>下車</b>${esc(t.dropoff.name)}</div>
        </div>
        ${t.routeLabel ? `<div class="route-label">${esc(t.routeLabel)}</div>` : ""}
      </li>`,
      )
      .join("");
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

  const marker = (p, color, label) =>
    L.circleMarker([p.lat, p.lon], { radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.95 }).bindPopup(
      `<b>${esc(p.name)}</b><br>${esc(label)} · ${esc(p.district)}${p.tripCount ? `<br>約 ${p.tripCount} 班停靠` : ""}`,
    );

  async function drawRouteLine(from, to) {
    if (!from?.lat || !to?.lat) return;
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=simplified&geometries=geojson`;
      const res = await fetch(url);
      const body = await res.json();
      const coords = body.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      L.polyline(coords, { color: "#0b6bcb", weight: 4, opacity: 0.6 }).addTo(layers);
    } catch {
      L.polyline(
        [
          [from.lat, from.lon],
          [to.lat, to.lon],
        ],
        { color: "#0b6bcb", weight: 3, opacity: 0.5, dashArray: "6 8" },
      ).addTo(layers);
    }
  }

  function renderMap() {
    ensureMap();
    layers.clearLayers();
    const pick = "#1a9b5a";
    const drop = "#d64545";
    const all = [];
    current.pickupPoints.forEach((p) => {
      p._m = marker(p, pick, "上車點").addTo(layers);
      all.push([p.lat, p.lon]);
    });
    current.dropoffPoints.forEach((p) => {
      p._m = marker(p, drop, "下車點").addTo(layers);
      all.push([p.lat, p.lon]);
    });
    if (me) {
      L.circleMarker([me.lat, me.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#0b6bcb", fillOpacity: 1 })
        .bindPopup("我的位置")
        .addTo(layers);
    }
    drawRouteLine(current.from, current.to);
    if (all.length) map.fitBounds(all, { padding: [20, 20] });
    else if (current.from?.lat) map.setView([current.from.lat, current.from.lon], 9);
    renderPointLists();
    setTimeout(() => map.invalidateSize(), 0);
  }

  function renderPointLists() {
    const list = (points) => {
      const items = points.map((p) => ({ p, d: me ? km(me, p) : null }));
      if (me) items.sort((a, b) => a.d - b.d);
      return items
        .map(
          ({ p, d }, i) =>
            `<li data-i="${current.pickupPoints.includes(p) ? "p" : "d"}${(current.pickupPoints.includes(p) ? current.pickupPoints : current.dropoffPoints).indexOf(p)}">${esc(p.name)}<span class="dist">${esc(p.district)}${d != null ? ` · ${fmtKm(d)}` : ""}</span></li>`,
        )
        .join("");
    };
    $("pickupList").innerHTML = list(current.pickupPoints);
    $("dropoffList").innerHTML = list(current.dropoffPoints);

    if (me) {
      const near = (pts) => pts.reduce((best, p) => (!best || km(me, p) < km(me, best) ? p : best), null);
      const np = near(current.pickupPoints);
      const nd = near(current.dropoffPoints);
      const parts = [];
      if (np) parts.push(`最近的上車點：${np.name}（${fmtKm(km(me, np))}）`);
      if (nd) parts.push(`最近的下車點：${nd.name}（${fmtKm(km(me, nd))}）`);
      $("nearest").textContent = parts.join("　");
    } else {
      $("nearest").textContent = "";
    }
  }

  function focusPoint(ev) {
    const li = ev.target.closest("li[data-i]");
    if (!li) return;
    const key = li.dataset.i;
    const p = (key[0] === "p" ? current.pickupPoints : current.dropoffPoints)[Number(key.slice(1))];
    if (!p) return;
    map.setView([p.lat, p.lon], 14);
    p._m.openPopup();
  }

  function locate() {
    if (!navigator.geolocation) return setStatus("這個瀏覽器不支援定位。", true);
    $("locate").disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        $("locate").disabled = false;
        renderMap();
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
    $("tab-trips").hidden = name !== "trips";
    $("tab-map").hidden = name !== "map";
    if (name === "map" && current) renderMap();
  }

  // ---------- wiring ----------
  $("search").addEventListener("submit", search);
  $("from").addEventListener("change", () => fillTo());
  $("swap").addEventListener("click", () => {
    const from = $("from").value;
    const to = $("to").value;
    if (!routes.some((r) => r.from === to && r.to === from)) return setStatus(`目前沒有 ${to} → ${from} 的路線資料。`, true);
    $("from").value = to;
    fillTo(from);
    setStatus("");
  });
  ["hideDeparted", "hideSoldOut", "sort"].forEach((id) => $(id).addEventListener("change", () => current && renderTrips()));
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("locate").addEventListener("click", locate);
  $("pickupList").addEventListener("click", focusPoint);
  $("dropoffList").addEventListener("click", focusPoint);

  fetch("routes.json")
    .then((r) => r.json())
    .then((list) => {
      routes = list;
      fillFrom();
      if (params.get("from")) $("from").value = params.get("from");
      fillTo(params.get("to"));
      if (params.get("from") && params.get("to")) search();
    })
    .catch(() => setStatus("讀取路線清單失敗。", true));
})();
