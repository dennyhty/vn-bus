// Shows one Vexere trip's pickup and drop-off stops, handed over in the URL by tools/trip-shortcut.js.
(async () => {
  const $ = (id) => document.getElementById(id);
  const vnd = (n) => (n ? Number(n).toLocaleString("en-US") + "₫" : "");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const gmapsUrl = (p) =>
    p.lat
      ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.addr}, Vietnam`)}`;
  const gmapsLink = (p) => `<a class="gmaps" href="${esc(gmapsUrl(p))}" target="_blank" rel="noopener">Google 地圖 ↗</a>`;
  const km = (a, b) => {
    const r = (x) => (x * Math.PI) / 180;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };
  const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000)} 公尺` : `${d.toFixed(1)} 公里`);
  const setStatus = (msg, error) => {
    $("status").textContent = msg;
    $("status").classList.toggle("error", !!error);
  };

  // "?z=" is deflate-compressed, "?d=" plain; "#d=" comes from links made before Shortcuts was found
  // to drop the hash.
  async function decode() {
    const m = /[?&#]([dz])=([^&]+)/.exec(location.search + location.hash);
    if (!m) return null;
    let bytes = Uint8Array.from(atob(m[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    if (m[1] === "z") bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  let data;
  try {
    data = await decode();
  } catch {
    data = null;
  }
  if (!data) {
    setStatus("沒有收到班次資料。請在 Vexere 某一班車的訂票頁，按「分享」→ 執行 VN-BUS 捷徑。", true);
    return;
  }

  // One trip (v1, from tools/trip-shortcut.js) or a whole results page (v2, tools/results-shortcut.js).
  const trips = (data.trips || [data]).map(prepTrip);
  let cur = trips[0];
  let me = null;

  // Vexere gives ISO timestamps ("2026-10-28T13:30:00+07:00"); show just the clock time.
  function hhmm(t) {
    return /T(\d{2}:\d{2})/.exec(t || "")?.[1] || t;
  }

  function prepTrip(t) {
    const toPoint = (kind) => ([name, addr, time, lat, lon, surcharge, transfer]) => ({ kind, name, addr, time, lat, lon, surcharge, transfer });
    const picks = t.p.map(toPoint("pickup"));
    const drops = t.d.map(toPoint("dropoff"));
    // Transfer points are served by a shuttle. The bus itself departs from the non-transfer pickup at
    // the trip's departure time and arrives at the non-transfer drop-off at its arrival time; without a
    // time match, fall back to the first non-transfer pickup and the last non-transfer drop-off (the bus
    // may let people off at roadside stops before its final station).
    const own = (points) => points.filter((p) => !p.transfer);
    const at = (points, time) => own(points).find((p) => p.time && p.time === hhmm(time));
    return {
      ...t,
      picks,
      drops,
      all: [...picks, ...drops],
      depart: at(picks, t.dep) || own(picks)[0],
      arrive: at(drops, t.arr) || own(drops).at(-1),
    };
  }

  const COLORS = { pickup: ["#1a9b5a", "#8fd19e"], dropoff: ["#d64545", "#f4a259"] };
  const color = (p) => COLORS[p.kind][p.transfer ? 1 : 0];
  const tag = (p) => (p === cur.depart ? "發車點" : p === cur.arrive ? "到站點" : p.transfer ? "接駁" : "");
  const nearest = (points) => (me ? points.filter((p) => p.lat).sort((a, b) => km(me, a) - km(me, b))[0] : null);
  const backUrl = (t) => (/^https:\/\/([a-z0-9-]+\.)?vexere\.com\//.test(t.url || data.url || "") ? t.url || data.url : "");

  // ---------- trip summary ----------
  function showSummary() {
    $("trip").hidden = false;
    $("tripTimes").textContent = [hhmm(cur.dep), hhmm(cur.arr)].filter(Boolean).join(" → ");
    $("tripFare").textContent = vnd(cur.fare);
    $("tripOp").textContent = cur.op;
    $("tripMeta").textContent = [cur.date || data.date, cur.veh, cur.seats != null && `剩 ${cur.seats} 位`].filter(Boolean).join("｜");
    $("back").hidden = !backUrl(cur);
    $("back").href = backUrl(cur) || "#";
    $("back").textContent = trips.length > 1 ? "回 Vexere 搜尋結果" : "回 Vexere 訂這班車";
    document.title = `${cur.op} ${hhmm(cur.dep)}｜班次停靠點`;
  }

  // ---------- trip list (results page) ----------
  function renderTripList() {
    if (trips.length < 2) return;
    $("tripsCard").hidden = false;
    const rows = trips.map((t, i) => ({ t, i, np: nearest(t.picks) }));
    if (me) rows.sort((a, b) => (a.np ? km(me, a.np) : 1e9) - (b.np ? km(me, b.np) : 1e9));
    $("tripsNote").textContent = me ? "依離你最近的上車點排序。" : `共 ${trips.length} 班。按「找離我最近的點」可依最近的上車點排序。`;
    $("tripList").innerHTML = rows
      .map(
        ({ t, i, np }) =>
          `<li data-t="${i}" class="${t === cur ? "sel" : ""}"><b>${esc(hhmm(t.dep))} → ${esc(hhmm(t.arr))}</b> ${esc(t.op)} <span class="fare">${vnd(t.fare)}</span>` +
          `<span class="meta">${[t.veh, t.seats != null && `剩 ${t.seats} 位`, `${t.p.length} 個上車點`].filter(Boolean).map(esc).join("｜")}</span>` +
          (np ? `<span class="meta">最近上車：${esc(np.time)} ${esc(np.name)}（${fmtKm(km(me, np))}）</span>` : "") +
          `</li>`,
      )
      .join("");
  }

  // ---------- map ----------
  $("mapCard").hidden = false;
  // The stop lists still work if the map library fails to load.
  const map = window.L ? L.map("map") : null;
  if (map)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
  else $("map").hidden = true;
  const layers = map && L.layerGroup().addTo(map);

  const label = (p) =>
    `${p.time ? `<b>${esc(p.time)}</b> ` : ""}${esc(p.name)}${p.surcharge ? ` <span class="approx">+${vnd(p.surcharge)}</span>` : ""}${tag(p) ? ` <span class="chip${p.transfer ? "" : " main"}">${tag(p)}</span>` : ""}`;

  function drawMap(keepView) {
    if (!map) return;
    layers.clearLayers();
    const bounds = [];
    cur.all.forEach((p) => {
      if (!p.lat) return;
      p.marker = L.circleMarker([p.lat, p.lon], {
        radius: p === cur.depart || p === cur.arrive ? 11 : p.transfer ? 7 : 8,
        color: "#fff",
        weight: 2,
        fillColor: color(p),
        fillOpacity: 0.95,
      })
        .bindPopup(`${p.kind === "pickup" ? "上車點" : "下車點"}：${label(p)}<br><small>${esc(p.addr)}</small><br>${gmapsLink(p)}`)
        .addTo(layers);
      bounds.push([p.lat, p.lon]);
    });
    if (me) L.circleMarker([me.lat, me.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#0b6bcb", fillOpacity: 1 }).bindPopup("我的位置").addTo(layers);
    if (!keepView && bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
    else if (!bounds.length) map.setView([10.8, 106.7], 7);
  }

  function render(keepView) {
    drawMap(keepView);

    const list = (points) =>
      points
        .map((p) => ({ p, d: me && p.lat ? km(me, p) : null }))
        .map(
          ({ p, d }) =>
            `<li data-i="${cur.all.indexOf(p)}">${label(p)}${d != null ? `<span class="dist">${fmtKm(d)}</span>` : ""} ${gmapsLink(p)}<span class="vi">${esc(p.addr)}</span></li>`,
        )
        .join("");
    $("pickList").innerHTML = list(cur.picks);
    $("dropList").innerHTML = list(cur.drops);
    renderTripList();

    if (me) {
      const np = nearest(cur.picks);
      const nd = nearest(cur.drops);
      $("nearest").textContent = [np && `最近的上車點：${np.time} ${np.name}（${fmtKm(km(me, np))}）`, nd && `最近的下車點：${nd.time} ${nd.name}（${fmtKm(km(me, nd))}）`]
        .filter(Boolean)
        .join("　");
    }
  }

  document.querySelector(".points").addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const li = e.target.closest("li[data-i]");
    const p = li && cur.all[li.dataset.i];
    if (!p?.marker) return;
    map.setView(p.marker.getLatLng(), 15);
    p.marker.openPopup();
    $("map").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("locate").addEventListener("click", () => {
    if (!navigator.geolocation) return setStatus("這個瀏覽器不支援定位。", true);
    $("locate").disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        $("locate").disabled = false;
        render(true);
        map?.setView([me.lat, me.lon], 12);
      },
      (err) => {
        $("locate").disabled = false;
        setStatus(`無法取得位置：${err.message}`, true);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });

  $("tripList").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-t]");
    if (!li) return;
    cur = trips[li.dataset.t];
    showSummary();
    render(false);
    $("trip").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  showSummary();
  render(false);
})();
