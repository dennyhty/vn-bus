// iOS Shortcuts "Run JavaScript on Web Page" code. Run it from Safari's Share sheet on a Vexere trip
// booking page (/ticketbooking/...). Reads the trip and its stops from the page's own data and
// returns a VN-BUS link; the shortcut's "Open URLs" action opens it in a new tab, so the Vexere page
// stays open. The data travels, compressed, in the link's query string (Shortcuts drops the # part);
// VN-BUS stores nothing.
(function () {
  var SITE = "https://dennyhty.github.io/vn-bus/trip.html";
  try {
    var b = JSON.parse(document.getElementById("__NEXT_DATA__").textContent).props.initialState.bookingReducer;
    var t = b.tripInfo || {};
    var ap = b.areaPoints || {};
    var name = function (o) { return o && typeof o === "object" ? o.name || o.label || "" : o || ""; };
    var pts = function (list) {
      return (list || []).filter(function (p) { return !p.hidden; }).map(function (p) {
        var a = p.areaDetail || {};
        return [p.name || "", p.postMergerAddress || p.address || "", p.time || "", a.latitude || null, a.longitude || null, p.surcharge || 0, p.is_transfer ? 1 : 0];
      });
    };
    var data = {
      v: 1,
      op: name(t.operator),
      veh: t.vehicleName || t.tripNameV2 || t.tripName || "",
      date: t.dateDeparture || "",
      dep: t.tripDepartureTime || "",
      arr: t.tripArrivalTime || "",
      fare: t.fare && typeof t.fare === "object" ? t.fare.discount || t.fare.original || 0 : t.fare || 0,
      seats: t.totalAvailableSeats,
      url: location.href,
      p: pts(ap.pickupPoints),
      d: pts(ap.dropOffPoints || ap.dropoffPoints),
    };
    if (!data.p.length && !data.d.length) throw new Error("這一頁沒有上下車點，請先點進某一班車的訂票頁");
    var bytes = new TextEncoder().encode(JSON.stringify(data));
    var b64 = function (u8) {
      var s = "";
      for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    var plain = function () { completion(SITE + "?d=" + b64(bytes)); };
    // Compress so trips with many stops stay well under URL length limits.
    if (!window.CompressionStream) return plain();
    new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw")))
      .arrayBuffer()
      .then(function (buf) { completion(SITE + "?z=" + b64(new Uint8Array(buf))); }, plain);
  } catch (e) {
    alert("VN-BUS：" + e.message);
    completion("");
  }
})();
