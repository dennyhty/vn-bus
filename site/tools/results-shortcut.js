// Runs on a dated Vexere search-results page (desktop layout), as an iOS Shortcuts "Run JavaScript on
// Web Page" action or as a bookmarklet. For each trip on the page it opens Details > Pick-up/Drop-off,
// the same as a person tapping it, one trip at a time, and keeps the stop list the page itself
// receives. Nothing is requested by this script. When done it offers a button that opens all trips in
// VN-BUS in a new tab, with the data in the link's # part.
(function () {
  var SITE = "https://dennyhty.github.io/vn-bus/trip.html";
  // A Shortcuts run must hand back a result; the work below goes on in the page.
  if (typeof completion === "function") completion("");
  if (window.__vnbusRunning) return;
  window.__vnbusRunning = true;

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var hhmm = function (t) { var m = /(\d{1,2}):(\d{2})/.exec(String(t || "").replace(/^.*T/, "")); return m ? ("0" + m[1]).slice(-2) + ":" + m[2] : ""; };

  // ---------- panel ----------
  var box = document.createElement("div");
  box.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;background:#fff;color:#1c2430;border:1px solid #ccd;border-radius:12px;padding:12px;font:16px -apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.25)";
  var msg = document.createElement("div");
  var btn = document.createElement("button");
  btn.style.cssText = "display:none;margin-top:10px;width:100%;padding:12px;font-size:17px;background:#0b6bcb;color:#fff;border:0;border-radius:8px";
  btn.textContent = "在 VN-BUS 打開（新分頁）";
  var close = document.createElement("button");
  close.style.cssText = "margin-top:8px;width:100%;padding:8px;font-size:15px;background:#eef1f5;color:#1c2430;border:0;border-radius:8px";
  close.textContent = "關閉";
  close.onclick = function () { box.remove(); window.__vnbusRunning = false; };
  box.append(msg, btn, close);
  document.body.appendChild(box);
  var say = function (t) { msg.textContent = "VN-BUS：" + t; };

  // ---------- listen to the stop lists the page receives ----------
  var got = {};
  var keep = function (url, text) {
    var m = /\/trip\/([^/?]+)\/pickup_dropoff_points/.exec(url || "");
    if (!m) return;
    try { got[m[1]] = JSON.parse(text).data; } catch (e) {}
  };
  var xopen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.addEventListener("load", function () { keep(String(url), this.responseText); });
    return xopen.apply(this, arguments);
  };
  var xfetch = window.fetch;
  window.fetch = function (input) {
    return xfetch.apply(this, arguments).then(function (res) {
      var url = typeof input === "string" ? input : input && input.url;
      if (/pickup_dropoff_points/.test(url || "")) res.clone().text().then(function (t) { keep(url, t); });
      return res;
    });
  };

  var trips = [];
  try { trips = JSON.parse(document.getElementById("__NEXT_DATA__").textContent).props.initialState.routeReducer.trips || []; } catch (e) {}
  var buttons = Array.prototype.slice.call(document.querySelectorAll("button.btn-detail"));
  if (!buttons.length) {
    say("找不到班次的 Details 按鈕。請確認這是有日期的搜尋結果頁；手機上請先在 Safari 選「要求桌面版網站」再試。");
    return;
  }

  // The panel shows each stop as "16:40 • Tan Dien Roundabout"; read those times from what is on screen.
  var shownTimes = function () {
    var out = {};
    document.querySelectorAll(".ant-tabs-tabpane-active").forEach(function (pane) {
      (pane.innerText || "").split("\n").forEach(function (line) {
        var m = /^\s*(\d{1,2}:\d{2})\s*[•·]\s*(.+?)\s*$/.exec(line);
        if (m) out[m[2]] = hhmm(m[1]);
      });
    });
    return out;
  };

  var points = function (list, transfer, times, base) {
    return (list || []).filter(function (p) { return !p.hidden; }).map(function (p) {
      var a = p.areaDetail || {};
      var name = p.english_name || p.name || "";
      var t = times[name] || times[p.name] || "";
      if (!t && base != null && p.duration != null) {
        var mins = (base + p.duration + 1440) % 1440;
        t = ("0" + Math.floor(mins / 60) % 24).slice(-2) + ":" + ("0" + (mins % 60)).slice(-2);
      }
      var r = function (x) { return x == null ? null : Math.round(x * 1e5) / 1e5; };
      return [name, p.address || p.english_address || "", t, r(a.latitude), r(a.longitude), p.surcharge || 0, transfer ? 1 : 0];
    });
  };

  (async function () {
    var timesByCode = {};
    for (var i = 0; i < buttons.length; i++) {
      if (!document.body.contains(box)) return;
      say("讀取第 " + (i + 1) + " / " + buttons.length + " 班的上下車點…");
      var before = Object.keys(got);
      var b = buttons[i];
      b.scrollIntoView({ block: "center" });
      b.click();
      await sleep(800);
      var card = b.closest("[class*='ticket']") || b.parentElement.parentElement;
      var tab = Array.prototype.slice.call((card || document).querySelectorAll(".ant-tabs-tab")).filter(function (n) { return /Pick-up\/Drop-off|Điểm đón/i.test(n.textContent); })[0];
      if (tab) tab.click();
      for (var w = 0; w < 30 && Object.keys(got).length === before.length; w++) await sleep(200);
      await sleep(400);
      var times = shownTimes();
      Object.keys(got).forEach(function (code) { if (before.indexOf(code) < 0) timesByCode[code] = times; });
      b.click(); // close Details again
      await sleep(600);
    }

    // Match each received stop list to its trip by trip code.
    var data = { v: 2, url: location.href, date: "", trips: [] };
    Object.keys(got).forEach(function (code) {
      var t = trips.filter(function (x) { return x.tripCode === code; })[0] || {};
      var d = got[code] || {};
      var shown = timesByCode[code] || {};
      // Derive the clock time of "duration 0" from any stop whose time is on screen, so the others get times too.
      var base = null;
      (d.pickup_points || []).concat(d.drop_off_points || []).some(function (p) {
        var s = shown[p.english_name] || shown[p.name];
        if (s && p.duration != null) { var hm = s.split(":"); base = (+hm[0] * 60 + +hm[1] - p.duration + 1440) % 1440; return true; }
      });
      data.date = data.date || t.departure_date || "";
      data.trips.push({
        op: t.busName || t.companyName || "",
        veh: t.vehicleTypeStr || "",
        dep: hhmm(t.fromTime) || "",
        arr: hhmm(t.toTime || t.arrival_time) || "",
        fare: t.fareLarge || t.originalFare || 0,
        seats: t.numberSeatAvailable,
        p: points(d.pickup_points, 0, shown, base).concat(points(d.transfer_points, 1, shown, base)),
        d: points(d.drop_off_points, 0, shown, base).concat(points(d.drop_off_transfer_points, 1, shown, base)),
      });
    });
    data.trips.sort(function (a, b) { return a.dep < b.dep ? -1 : 1; });
    if (!data.trips.length) { say("沒有收到任何班次的上下車點。請重新整理這一頁再試一次。"); return; }

    var bytes = new TextEncoder().encode(JSON.stringify(data));
    var b64 = function (u8) {
      var s = "";
      for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    var url = SITE + "#d=" + b64(bytes);
    if (window.CompressionStream) {
      try {
        var buf = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
        url = SITE + "#z=" + b64(new Uint8Array(buf));
      } catch (e) {}
    }
    say("完成：讀到 " + data.trips.length + " / " + buttons.length + " 班的上下車點。");
    btn.style.display = "block";
    btn.onclick = function () { window.open(url, "_blank"); };
    window.__vnbusRunning = false;
  })();
})();
