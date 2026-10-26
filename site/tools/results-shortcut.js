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
  // Check every 50 ms until test() gives something, instead of waiting a fixed time.
  var waitFor = async function (test, ms) {
    for (var end = Date.now() + ms; ; ) {
      var v = test();
      if (v || Date.now() > end) return v;
      await sleep(50);
    }
  };
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
  // Shortcuts runs this code in its own copy of window, so hooking XMLHttpRequest here would not see the
  // page's requests. Put the hook in the page with a <script> tag; it hands each stop list back through a
  // hidden element, since the page and this code share the DOM.
  var hook = function () {
    if (window.__vnbusHook) return;
    window.__vnbusHook = true;
    var hand = function (url, text) {
      if (!/pickup_dropoff_points/.test(url || "")) return;
      var el = document.createElement("script");
      el.type = "application/json";
      el.setAttribute("data-vnbus", url);
      el.textContent = text;
      document.documentElement.appendChild(el);
    };
    var xopen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.addEventListener("load", function () { hand(String(url), this.responseText); });
      return xopen.apply(this, arguments);
    };
    var xfetch = window.fetch;
    window.fetch = function (input) {
      return xfetch.apply(this, arguments).then(function (res) {
        var url = typeof input === "string" ? input : input && input.url;
        if (/pickup_dropoff_points/.test(url || "")) res.clone().text().then(function (t) { hand(url, t); });
        return res;
      });
    };
    document.documentElement.setAttribute("data-vnbus-hook", "1");
  };
  var tag = document.createElement("script");
  tag.textContent = "(" + hook + ")();";
  document.documentElement.appendChild(tag);
  tag.remove();
  if (document.documentElement.getAttribute("data-vnbus-hook") !== "1") hook(); // page refused the tag: hook here instead
  setInterval(function () {
    document.querySelectorAll("script[data-vnbus]").forEach(function (el) {
      keep(el.getAttribute("data-vnbus"), el.textContent);
      el.remove();
    });
  }, 100);

  var trips = [];
  try { trips = JSON.parse(document.getElementById("__NEXT_DATA__").textContent).props.initialState.routeReducer.trips || []; } catch (e) {}
  var buttons = Array.prototype.slice.call(document.querySelectorAll("button.btn-detail"));
  if (!buttons.length) {
    say("找不到班次的 Details 按鈕。請確認這是有日期的搜尋結果頁；手機上請先在 Safari 選「要求桌面版網站」再試。");
    return;
  }

  // A trip's card is the largest box around its Details button that holds no other trip.
  var cardOf = function (b) {
    var n = b;
    while (n.parentElement && n.parentElement !== document.body && n.parentElement.querySelectorAll("button.btn-detail").length === 1) n = n.parentElement;
    return n;
  };
  var isTab = function (n) { return /Pick-up\/Drop-off|Điểm đón/i.test(n.textContent); };
  var tabsIn = function (card) { return Array.prototype.slice.call(card.querySelectorAll(".ant-tabs-tab")).filter(function (n) { return n.offsetParent; }); };
  // What the card shows: "Phương Trang ★4.9 (5302)", "Limousine sleeping bus", "17:20 • Bến xe Bình Minh",
  // "20:40 • Bến xe Ga", "220,000 VND", "33 seats left". Read with Details closed.
  var cardInfo = function (card) {
    var lines = (card.innerText || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
    var stops = [], fare = 0, seats = null, words = [];
    lines.forEach(function (l) {
      var m;
      if ((m = /^(\d{1,2}:\d{2})\s*[•·]\s*(.+)$/.exec(l))) stops.push([hhmm(m[1]), m[2]]);
      else if (!fare && (m = /^([\d.,]+)\s*(VND|đ|₫)/i.exec(l))) fare = +m[1].replace(/[.,]/g, "");
      else if ((m = /^(\d+)\s*(seats? left|chỗ trống)/i.exec(l))) seats = +m[1];
      else if (!/^\d|^★|details|book|call|^\*|belongs|thuộc|instant|free|shuttle|live|no prepayment|\d+h\d*m?$/i.test(l)) words.push(l.replace(/\s*★.*$/, ""));
    });
    return { op: words[0] || "", veh: words[1] || "", dep: (stops[0] || [])[0] || "", arr: (stops[1] || [])[0] || "", fare: fare, seats: seats };
  };

  // The panel shows each stop as "16:40 • Tan Dien Roundabout"; read those times from what is on screen.
  var shownTimes = function (root) {
    var out = {};
    (root || document).querySelectorAll(".ant-tabs-tabpane-active").forEach(function (pane) {
      (pane.innerText || "").split("\n").forEach(function (line) {
        var m = /^\s*(\d{1,2}:\d{2})\s*[•·]\s*(.+?)\s*$/.exec(line);
        if (m) out[m[2]] = hhmm(m[1]);
      });
    });
    return out;
  };

  // Vexere's own share link opens the results page with this trip pinned (and the app, on a phone):
  // ?pinned_trips=<trip id>_<YYYY-MM-DD>_<HH:MM>_<pickup id>_<drop-off id>.
  var pinUrl = function (t, d, dep) {
    var id = t.id || t.tripId || t.trip_id;
    var dm = /(\d{2})-(\d{2})-(\d{4})/.exec(t.departure_date || new URLSearchParams(location.search).get("date") || "");
    var pid = function (list, last) {
      var l = (list || []).filter(function (p) { return !p.hidden; });
      var p = last ? l[l.length - 1] : l[0];
      return p && (p.id || p.point_id);
    };
    var pick = pid(d.pickup_points), drop = pid(d.drop_off_points, true);
    if (!id || !dm || !dep) return "";
    var u = new URL(location.href);
    u.searchParams.delete("pinned_trips");
    u.hash = "";
    return u.href + (u.search ? "&" : "?") + "pinned_trips=" + [id, dm[3] + "-" + dm[2] + "-" + dm[1], dep, pick || "", drop || ""].join("_");
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
    // Press "See more" until every trip is on the page (it disappears, or stops adding trips).
    var count = function () { return document.querySelectorAll("button.btn-detail").length; };
    for (var more = 0; more < 30; more++) {
      var seeMore = Array.prototype.slice.call(document.querySelectorAll("button, a, div[role=button]")).filter(function (n) {
        return /^\s*(See more|Xem thêm)\s*$/i.test(n.textContent) && n.offsetParent && !n.disabled;
      })[0];
      if (!seeMore) break;
      var had = count();
      say("載入更多班次…（目前 " + had + " 班）");
      seeMore.click();
      if (!(await waitFor(function () { return count() > had; }, 6000))) break;
    }
    buttons = Array.prototype.slice.call(document.querySelectorAll("button.btn-detail"));
    // Close any Details left open, so each click below opens its trip.
    buttons.forEach(function (b) { if (tabsIn(cardOf(b)).length) b.click(); });

    var timesByCode = {};
    var infoByCode = {};
    var spent = [0, 0, 0]; // ms waiting for: the tab, the stop list, the shown times
    var start = Date.now();
    for (var i = 0; i < buttons.length; i++) {
      if (!document.body.contains(box)) return;
      say("讀取第 " + (i + 1) + " / " + buttons.length + " 班的上下車點…");
      var before = Object.keys(got);
      var b = buttons[i];
      var card = cardOf(b);
      var info = cardInfo(card);
      b.click();
      var t0 = Date.now();
      var tab = await waitFor(function () { return tabsIn(card).filter(isTab)[0]; }, 3000);
      var t1 = Date.now();
      if (tab && /active/.test(tab.className)) {
        // Already on Pick-up/Drop-off: step to another tab and back so the page loads it again.
        var other = tabsIn(card).filter(function (n) { return n !== tab; })[0];
        if (other) { other.click(); await sleep(100); }
      }
      if (tab) tab.click();
      await waitFor(function () { return Object.keys(got).length > before.length; }, 6000);
      var t2 = Date.now();
      // Read only this trip's panel, so an earlier trip's panel can't answer for it.
      var root = (tab && tab.closest(".ant-tabs")) || card;
      var times = await waitFor(function () { var t = shownTimes(root); return Object.keys(t).length ? t : null; }, 1500) || {};
      var t3 = Date.now();
      Object.keys(got).forEach(function (code) { if (before.indexOf(code) < 0) { timesByCode[code] = times; infoByCode[code] = info; } });
      b.click(); // close Details again
      await sleep(150);
      spent[0] += t1 - t0; spent[1] += t2 - t1; spent[2] += t3 - t2;
    }

    // Match each received stop list to its trip by trip code.
    var data = { v: 2, url: location.href, date: "", trips: [] };
    Object.keys(got).forEach(function (code) {
      var c = infoByCode[code] || {};
      // The page data has no stop-list code; match its trip by departure time and fare.
      var t = trips.filter(function (x) { return x.tripCode === code; })[0] ||
        trips.filter(function (x) { return c.dep && hhmm(x.fromTime) === c.dep && (!c.fare || [x.fareLarge, x.fare, x.originalFare].indexOf(c.fare) >= 0); })[0] || {};
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
        op: c.op || t.busName || t.companyName || "",
        veh: c.veh || t.vehicleTypeStr || "",
        dep: c.dep || hhmm(t.fromTime) || "",
        arr: c.arr || hhmm(t.toTime || t.arrival_time) || "",
        fare: c.fare || t.fareLarge || t.originalFare || 0,
        seats: c.seats != null ? c.seats : t.numberSeatAvailable,
        url: pinUrl(t, d, c.dep || hhmm(t.fromTime)),
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
    var linked = data.trips.filter(function (x) { return x.url; }).length;
    var sec = function (ms) { return (ms / 1000 / buttons.length).toFixed(1); };
    say("完成：讀到 " + data.trips.length + " / " + buttons.length + " 班的上下車點，共 " + Math.round((Date.now() - start) / 1000) + " 秒（每班平均：等分頁 " + sec(spent[0]) + "、等資料 " + sec(spent[1]) + "、等時間 " + sec(spent[2]) + " 秒）。" +
      (!linked ? " 每班都找不到直接連結（欄位：" + Object.keys(trips[0] || {}).slice(0, 40).join(",") + "）" :
        linked < data.trips.length ? " 有 " + (data.trips.length - linked) + " 班（See more 載入的）沒有直接連結，會回搜尋結果頁。" : ""));
    btn.style.display = "block";
    btn.onclick = function () { window.open(url, "_blank"); };
    window.__vnbusRunning = false;
  })();
})();
