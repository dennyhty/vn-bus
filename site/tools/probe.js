// Runs on a Vexere page the user has opened. Reads only what the page already loaded in this browser,
// drops anything that looks like a credential, and copies a structure outline to the clipboard.
(function () {
  var SECRET = /auth|token|bearer|signature|cookie|secret|nonce|password|key|user|email|phone|mobile|profile|account/i;
  var lines = [];
  function walk(v, path, depth) {
    if (lines.length > 600) return;
    if (v === null || typeof v !== "object") {
      lines.push(path + " = " + JSON.stringify(String(v)).slice(0, 60));
      return;
    }
    if (Array.isArray(v)) {
      lines.push(path + " [array " + v.length + "]");
      if (v.length && depth < 9) walk(v[0], path + "[0]", depth + 1);
      return;
    }
    var keys = Object.keys(v);
    lines.push(path + " {" + keys.length + " keys}");
    if (depth >= 9) return;
    keys.forEach(function (k) {
      if (SECRET.test(k)) return lines.push(path + "." + k + " = (hidden)");
      walk(v[k], path + "." + k, depth + 1);
    });
  }
  var out = ["page: " + location.origin + location.pathname];
  try {
    var el = document.getElementById("__NEXT_DATA__");
    walk(JSON.parse(el.textContent), "NEXT", 0);
  } catch (e) {
    out.push("no __NEXT_DATA__: " + e.message);
  }
  var hints = /pickup|drop|stop|điểm đón|điểm trả|trạm/i;
  var seen = {};
  document.querySelectorAll("*").forEach(function (n) {
    if (n.children.length === 0 && n.textContent && hints.test(n.textContent) && n.textContent.length < 60) seen[n.textContent.trim()] = 1;
  });
  out.push("visible labels: " + Object.keys(seen).slice(0, 25).join(" | "));
  out.push("trip-like elements: " + document.querySelectorAll('[class*="trip"],[class*="Trip"]').length);
  var text = out.concat(lines).join("\n");
  function done() {
    alert("已複製 " + text.length + " 字，回到對話貼上。");
  }
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { prompt("複製這段：", text.slice(0, 2000)); });
  else prompt("複製這段：", text.slice(0, 2000));
})();
