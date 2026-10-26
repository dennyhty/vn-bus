// Shows one Vexere trip's pickup and drop-off stops, handed over in the URL hash by tools/trip-shortcut.js.
(() => {
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

  function decode() {
    const m = location.hash.match(/[#&]d=([^&]+)/);
    if (!m) return null;
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  let data;
  try {
    data = decode();
  } catch {
    data = null;
  }
  if (!data) {
    setStatus("沒有收到班次資料。請在 Vexere 某一班車的訂票頁，按「分享」→ 執行 VN-BUS 捷徑。", true);
    return;
  }

  const toPoint = (kind) => ([name, addr, time, lat, lon, surcharge, transfer]) => ({ kind, name, addr, time, lat, lon, surcharge, transfer });
  const picks = data.p.map(toPoint("pickup"));
  const drops = data.d.map(toPoint("dropoff"));
  const all = [...picks, ...drops];
  // Transfer points are served by a shuttle; the first non-transfer point is where the bus itself
  // departs (pickups) or arrives (drop-offs).
  const main = (points) => points.find((p) => !p.transfer);
  const depart = main(picks);
  const arrive = main(drops);
  const COLORS = { pickup: ["#1a9b5a", "#8fd19e"], dropoff: ["#d64545", "#f4a259"] };
  const color = (p) => COLORS[p.kind][p.transfer ? 1 : 0];
  const tag = (p) => (p === depart ? "發車點" : p === arrive ? "到站點" : p.transfer ? "接駁" : "");
  let me = null;

  // ---------- trip summary ----------
  $("trip").hidden = false;
  // Vexere gives ISO timestamps ("2026-10-28T13:30:00+07:00"); show just the clock time.
  const hhmm = (t) => /T(\d{2}:\d{2})/.exec(t || "")?.[1] || t;
  $("tripTimes").textContent = [hhmm(data.dep), hhmm(data.arr)].filter(Boolean).join(" → ");
  $("tripFare").textContent = vnd(data.fare);
  $("tripOp").textContent = data.op;
  $("tripMeta").textContent = [data.date, data.veh, data.seats != null && `剩 ${data.seats} 位`].filter(Boolean).join("｜");
  if (/^https:\/\/([a-z0-9-]+\.)?vexere\.com\//.test(data.url || "")) $("back").href = data.url;
  else $("back").hidden = true;
  document.title = `${data.op} ${hhmm(data.dep)}｜班次停靠點`;

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
    all.forEach((p) => {
      if (!p.lat) return;
      p.marker = L.circleMarker([p.lat, p.lon], {
        radius: p === depart || p === arrive ? 11 : p.transfer ? 7 : 8,
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
            `<li data-i="${all.indexOf(p)}">${label(p)}${d != null ? `<span class="dist">${fmtKm(d)}</span>` : ""} ${gmapsLink(p)}<span class="vi">${esc(p.addr)}</span></li>`,
        )
        .join("");
    $("pickList").innerHTML = list(picks);
    $("dropList").innerHTML = list(drops);

    if (me) {
      const nearest = (points) => points.filter((p) => p.lat).sort((a, b) => km(me, a) - km(me, b))[0];
      const np = nearest(picks);
      const nd = nearest(drops);
      $("nearest").textContent = [np && `最近的上車點：${np.time} ${np.name}（${fmtKm(km(me, np))}）`, nd && `最近的下車點：${nd.time} ${nd.name}（${fmtKm(km(me, nd))}）`]
        .filter(Boolean)
        .join("　");
    }
  }

  document.querySelector(".points").addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const li = e.target.closest("li[data-i]");
    const p = li && all[li.dataset.i];
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

  render(false);
})();
