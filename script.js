/* =========================================================
   CampusPool – script.js
   1. Data (places + rides)        5. Map (Leaflet)
   2. Helpers (distance, fare)     6. Booking modal + OTP
   3. State                        7. My bookings
   4. Rendering (list + detail)    8. Start-up
   ========================================================= */

/* ---------- 1. DATA ---------- */
/* Real places in Jalandhar & Phagwara. pos = [latitude, longitude].
   Coordinates are approximate: right-click a spot on Google Maps to copy exact ones. */
const CAMPUS = "lpu";

const PLACES = {
  lpu:         { name: "LPU Campus (Phagwara)",      pos: [31.2554, 75.7054] },
  lawgate:     { name: "Law Gate, Phagwara",         pos: [31.2528, 75.7032] },
  phgBus:      { name: "Phagwara Bus Stand",         pos: [31.2237, 75.7700] },
  phgRail:     { name: "Phagwara Railway Station",   pos: [31.2186, 75.7727] },
  jalBus:      { name: "Jalandhar Bus Stand",        pos: [31.3226, 75.5833] },
  jalRail:     { name: "Jalandhar City Railway Stn", pos: [31.3260, 75.5760] },
  pap:         { name: "PAP Chowk, Jalandhar",       pos: [31.2990, 75.5840] },
  bmc:         { name: "BMC Chowk, Jalandhar",       pos: [31.3105, 75.5905] },
  modelTown:   { name: "Model Town, Jalandhar",      pos: [31.3030, 75.5610] }
};

/* Each ride:
   dir   "to"   = goes TO college (stops are pickups, route ends at LPU)
         "from" = goes FROM college (route starts at LPU, stops are drop-offs)
   rate  = rupees charged per km per seat
   seats = passenger seats in the car
   pass  = people who already booked: { n: name, at: stop key }                */
const RIDES = [
  { id: 1, dir: "to",   driver: "Gurpreet Singh", car: "Maruti Swift",   rate: 4.5, seats: 3, time: "7:30 AM",
    stops: ["jalBus", "bmc", "pap"],            pass: [{ n: "Simran", at: "jalBus" }, { n: "Aman", at: "pap" }] },
  { id: 2, dir: "to",   driver: "Harman Preet",   car: "Hyundai i20",    rate: 5,   seats: 3, time: "8:00 AM",
    stops: ["modelTown", "jalRail", "pap"],     pass: [{ n: "Kritika", at: "modelTown" }] },
  { id: 3, dir: "to",   driver: "Navdeep Kaur",   car: "Honda City",     rate: 5.5, seats: 4, time: "8:15 AM",
    stops: ["jalRail", "jalBus", "bmc"],        pass: [{ n: "Jaspreet", at: "jalRail" }, { n: "Rohan", at: "bmc" }, { n: "Isha", at: "bmc" }, { n: "Karan", at: "jalBus" }] },
  { id: 4, dir: "to",   driver: "Aman Verma",     car: "Tata Nexon",     rate: 4,   seats: 3, time: "8:30 AM",
    stops: ["phgRail", "phgBus", "lawgate"],    pass: [{ n: "Mehak", at: "phgBus" }] },
  { id: 5, dir: "to",   driver: "Ritu Sharma",    car: "Maruti Ertiga",  rate: 3.5, seats: 6, time: "9:00 AM",
    stops: ["phgBus", "phgRail"],               pass: [{ n: "Dev", at: "phgRail" }, { n: "Anjali", at: "phgBus" }] },
  { id: 6, dir: "from", driver: "Jashan Brar",    car: "Maruti WagonR",  rate: 4.5, seats: 3, time: "4:30 PM",
    stops: ["lawgate", "phgBus", "phgRail"],    pass: [{ n: "Tanvi", at: "phgBus" }, { n: "Yash", at: "lawgate" }] },
  { id: 7, dir: "from", driver: "Simran Gill",    car: "Hyundai Verna",  rate: 5,   seats: 3, time: "5:00 PM",
    stops: ["pap", "bmc", "jalBus", "jalRail"], pass: [{ n: "Lovepreet", at: "pap" }, { n: "Sahil", at: "jalBus" }] },
  { id: 8, dir: "from", driver: "Karan Mehta",    car: "Honda Amaze",    rate: 5,   seats: 3, time: "5:30 PM",
    stops: ["modelTown", "jalBus"],             pass: [] }
];

// Keep a copy of the original passengers so cancelling a booking can reset them
RIDES.forEach(r => (r.base = r.pass.slice()));

/* ---------- 2. HELPERS ---------- */
const $ = id => document.getElementById(id);

// Straight-line distance between two points on Earth (Haversine formula)
function haversine(a, b) {
  const R = 6371, rad = d => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Road distance is about 25% longer than a straight line
function roadKm(stopKey) {
  return haversine(PLACES[stopKey].pos, PLACES[CAMPUS].pos) * 1.25;
}

// Fare for ONE seat = distance from your stop to campus x ride's rate per km
function fareFor(ride, stopKey) {
  return Math.max(20, Math.round(roadKm(stopKey) * ride.rate));
}

// What a solo cab would roughly cost (about Rs 16 per km) – used to show savings
function cabFor(stopKey) {
  return Math.round(roadKm(stopKey) * 16);
}

const seatsTaken = ride => ride.pass.reduce((sum, p) => sum + (p.k || 1), 0);
const seatsLeft  = ride => ride.seats - seatsTaken(ride);

// Safe text: stops a user's typed name from running as HTML
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function routeKeys(ride) {
  return ride.dir === "to" ? [...ride.stops, CAMPUS] : [CAMPUS, ...ride.stops];
}

const routeText = ride => routeKeys(ride).map(k => PLACES[k].name.split(",")[0]).join("  →  ");

/* ---------- 3. STATE ---------- */
const state = {
  dir: "to",          // "to" or "from" college
  area: "all",        // chosen area filter
  selected: null,     // selected ride object
  stop: null,         // stop chosen for the selected ride
  bookings: load("cp_bookings", []),
  otp: null, tries: 0, timer: null, seatsWanted: 1
};

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch (e) { return fallback; }
}
function save() { localStorage.setItem("cp_bookings", JSON.stringify(state.bookings)); }

// Rebuild every ride's passenger list = original passengers + my bookings
function applyBookings() {
  RIDES.forEach(r => (r.pass = r.base.slice()));
  state.bookings.forEach(b => {
    const r = RIDES.find(x => x.id === b.rideId);
    if (r) r.pass.push({ n: b.name + " (you)", at: b.stop, k: b.seats, mine: true });
  });
}

/* ---------- 4. RENDERING ---------- */

// Fill the "Your area" dropdown
function fillAreas() {
  const keys = Object.keys(PLACES).filter(k => k !== CAMPUS);
  $("areaSelect").innerHTML =
    `<option value="all">All areas</option>` +
    keys.map(k => `<option value="${k}">${PLACES[k].name}</option>`).join("");
}

// Show ride cards that match direction + area
function renderList() {
  const list = RIDES.filter(r =>
    r.dir === state.dir && (state.area === "all" || r.stops.includes(state.area))
  );

  $("resultInfo").textContent = list.length
    ? `${list.length} ride${list.length > 1 ? "s" : ""} ${state.dir === "to" ? "to" : "from"} LPU`
    : "";

  if (!list.length) {
    $("rideList").innerHTML =
      `<p class="muted">No rides from this area yet. Try “All areas” or the other direction.</p>`;
    return;
  }

  $("rideList").innerHTML = list.map((r, i) => {
    const left = seatsLeft(r);
    const fares = r.stops.map(s => fareFor(r, s));
    const seatIcons = Array.from({ length: r.seats }, (_, n) =>
      `<span class="seat ${n < seatsTaken(r) ? "taken" : ""}"></span>`).join("");

    return `
      <button class="ride-card ${left === 0 ? "full" : ""} ${state.selected && state.selected.id === r.id ? "selected" : ""}"
              data-id="${r.id}" style="animation-delay:${i * 70}ms">
        <div class="card-top">
          <div><h3>${r.driver}</h3><p class="car">${r.car}</p></div>
          <div class="price">₹${Math.min(...fares)}<small>per seat, from</small></div>
        </div>
        <p class="route-text">${routeText(r)}</p>
        <div class="card-bottom">
          <span class="time">${r.time}</span>
          <span class="seats">${seatIcons}&nbsp;${left === 0 ? "Full" : left + " left"}</span>
        </div>
      </button>`;
  }).join("");
}

// Show the details of the selected ride (cost, stops, co-riders)
function renderDetail() {
  const r = state.selected;
  if (!r) return;

  const fare = fareFor(r, state.stop);
  const cab = cabFor(state.stop);
  const left = seatsLeft(r);
  const word = r.dir === "to" ? "Pickup" : "Drop";

  const chips = r.stops.map(s =>
    `<button class="chip ${s === state.stop ? "active" : ""}" data-stop="${s}">${PLACES[s].name.split(",")[0]}</button>`
  ).join("");

  const riders = r.pass.length
    ? r.pass.map(p => `
        <li class="${p.mine ? "you" : ""}">
          <span class="avatar">${esc(p.n[0].toUpperCase())}</span>
          <span>${esc(p.n)}<small>${word}: ${PLACES[p.at].name}</small></span>
        </li>`).join("")
    : `<li class="muted">No one yet. You would be the first rider.</li>`;

  const d = $("detail");
  d.classList.remove("show"); void d.offsetWidth; d.classList.add("show");  // restart animation
  d.innerHTML = `
    <h3>${r.driver} · ${r.car}</h3>
    <p class="meta">${r.time} · ${r.dir === "to" ? "Going to LPU" : "Leaving LPU"} · ${left} seat${left === 1 ? "" : "s"} left</p>

    <h4>Choose your ${word.toLowerCase()} point</h4>
    <div class="chips">${chips}</div>

    <div class="fare-box">
      <div>
        <div class="big pop" id="fareNum">₹${fare}</div>
        <small>per seat · ${roadKm(state.stop).toFixed(1)} km × ₹${r.rate}/km</small>
      </div>
      <div class="save">Solo cab ≈ ₹${cab}<br>You save ₹${Math.max(0, cab - fare)}</div>
    </div>

    <h4>Riding in this car</h4>
    <ul class="riders">${riders}</ul>

    <button class="btn primary full" id="bookBtn" ${left === 0 ? "disabled" : ""}>
      ${left === 0 ? "Car is full" : "Book a seat"}
    </button>`;
}

function selectRide(id) {
  state.selected = RIDES.find(r => r.id === id);
  state.stop = state.selected.stops[0];
  renderList();
  renderDetail();
  drawRoute();
  if (window.innerWidth < 900) $("map").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- 5. MAP (Leaflet + OpenStreetMap data) ---------- */
// OpenStreetMap tiles do not require an API key.
const map = L.map("map", {
  zoomControl: true,
  scrollWheelZoom: false
}).setView([31.28, 75.66], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  subdomains: "abc",
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const layer = L.layerGroup().addTo(map);   // everything we draw lives here so we can clear it
let drawToken = 0;                         // used to ignore outdated route requests

function pin(label, cls) {
  return L.divIcon({
    className: "", iconSize: [30, 30], iconAnchor: [8, 30],
    html: `<div class="pin ${cls || ""}"><span>${label}</span></div>`
  });
}

// Before any ride is chosen: show all places as small dots + the campus
function drawOverview() {
  layer.clearLayers();
  Object.entries(PLACES).forEach(([k, p]) => {
    if (k === CAMPUS) L.marker(p.pos, { icon: pin("LPU", "campus") }).addTo(layer).bindTooltip(p.name);
    else L.marker(p.pos, { icon: L.divIcon({ className: "", html: '<div class="pin dot"></div>', iconSize: [12, 12] }) })
           .addTo(layer).bindTooltip(p.name);
  });
  map.setView([31.28, 75.66], 11);
}

// After a ride is chosen: draw the route, stops and co-riders
function drawRoute() {
  const r = state.selected;
  const keys = routeKeys(r);
  const points = keys.map(k => PLACES[k].pos);
  const myToken = ++drawToken;
  layer.clearLayers();

  // 1) quick straight line (shown instantly)
  let line = L.polyline(points, { color: "#8c9bff", weight: 4, className: "route-line" }).addTo(layer);

  // 2) markers – numbered in route order, with the names of riders at that stop
  keys.forEach((k, i) => {
    const people = r.pass.filter(p => p.at === k).map(p => p.n).join(", ");
    const isCampus = k === CAMPUS;
    const mine = k === state.stop && !isCampus;
    const label = isCampus ? "LPU" : i + 1;
    L.marker(PLACES[k].pos, { icon: pin(label, isCampus ? "campus" : mine ? "user" : "") })
      .addTo(layer)
      .bindTooltip(`<b>${PLACES[k].name}</b>${people ? "<br>" + esc(people) : ""}`);
  });

  map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });

  // 3) try to replace the straight line with the real road route (free OSRM service)
  const coords = points.map(p => `${p[1]},${p[0]}`).join(";");
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 6000);
  fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal: ctrl.signal })
    .then(res => res.json())
    .then(data => {
      if (myToken !== drawToken || !data.routes || !data.routes[0]) return;
      layer.removeLayer(line);
      const road = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      line = L.polyline(road, { color: "#8c9bff", weight: 4, className: "route-line" }).addTo(layer).bringToBack();
    })
    .catch(() => { /* offline or blocked: the straight line stays */ });
}

/* ---------- 6. BOOKING MODAL + OTP ---------- */
const modal = $("modal");

function openModal() {
  const r = state.selected;
  const left = seatsLeft(r);

  $("modalSummary").textContent =
    r.dir === "to"
      ? `${PLACES[state.stop].name} → LPU · ${r.time}`
      : `LPU → ${PLACES[state.stop].name} · ${r.time}`;

  $("seatsInput").innerHTML =
    Array.from({ length: left }, (_, i) => `<option value="${i + 1}">${i + 1} seat${i ? "s" : ""}</option>`).join("");
  $("seatsInput").onchange = updateTotal;
  updateTotal();

  $("err1").textContent = "";
  showStep(1);
  modal.hidden = false;
  $("nameInput").focus();
}

function updateTotal() {
  const n = Number($("seatsInput").value) || 1;
  $("modalTotal").textContent = "₹" + fareFor(state.selected, state.stop) * n;
}

function showStep(n) {
  document.querySelectorAll(".step").forEach(s => (s.hidden = Number(s.dataset.step) !== n));
}

function closeModal() {
  modal.hidden = true;
  clearInterval(state.timer);
}

// ---- OTP ----
/* DEMO ONLY: a website cannot send real SMS by itself – it needs a server
   and an SMS service (Twilio, Fast2SMS, MSG91...). So here we make the OTP in
   the browser and show it in a fake "SMS" popup. To go live, replace the body
   of sendOtp() with a fetch() call to your own backend that sends the SMS. */
function sendOtp(phone) {
  state.otp = String(Math.floor(100000 + Math.random() * 900000));   // 6 random digits
  state.tries = 0;
  $("smsBody").innerHTML = `<b>CampusPool:</b> Your OTP is <b>${state.otp}</b>. Do not share it with anyone.`;
  $("sms").hidden = false;
  clearTimeout(sendOtp.hide);
  sendOtp.hide = setTimeout(() => ($("sms").hidden = true), 20000);
}

function buildOtpBoxes() {
  const wrap = $("otpBoxes");
  wrap.innerHTML = Array.from({ length: 6 }, () =>
    `<input type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code" aria-label="OTP digit">`).join("");
  const boxes = [...wrap.children];

  boxes.forEach((box, i) => {
    box.addEventListener("input", () => {
      box.value = box.value.replace(/\D/g, "");
      if (box.value && boxes[i + 1]) boxes[i + 1].focus();
    });
    box.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !box.value && boxes[i - 1]) boxes[i - 1].focus();
      if (e.key === "Enter") $("verifyBtn").click();
    });
    box.addEventListener("paste", e => {          // paste the full code at once
      e.preventDefault();
      const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      digits.split("").forEach((d, j) => (boxes[j].value = d));
      (boxes[Math.min(digits.length, 5)]).focus();
    });
  });
  boxes[0].focus();
}

function startResendTimer() {
  let secs = 30;
  $("resendBtn").disabled = true;
  clearInterval(state.timer);
  const tick = () => {
    $("timerText").textContent = secs > 0 ? `Resend in ${secs}s ` : "";
    if (secs-- <= 0) { clearInterval(state.timer); $("resendBtn").disabled = false; }
  };
  tick();
  state.timer = setInterval(tick, 1000);
}

// Step 1 -> Step 2
$("sendOtpBtn").addEventListener("click", () => {
  const name = $("nameInput").value.trim();
  const phone = $("phoneInput").value.trim();
  const err = $("err1");

  if (name.length < 2)              return (err.textContent = "Enter your full name.");
  if (!/^[6-9]\d{9}$/.test(phone))  return (err.textContent = "Enter a valid 10-digit Indian mobile number.");

  err.textContent = "";
  state.seatsWanted = Number($("seatsInput").value);
  state.pending = { name, phone };

  sendOtp(phone);
  $("otpPhone").textContent = "+91 " + phone.slice(0, 2) + "XXXXXX" + phone.slice(-2);
  $("err2").textContent = "";
  showStep(2);
  buildOtpBoxes();
  startResendTimer();
});

$("resendBtn").addEventListener("click", () => {
  sendOtp(state.pending.phone);
  buildOtpBoxes();
  $("err2").textContent = "A new OTP has been sent.";
  startResendTimer();
});

// Step 2 -> Step 3 (verify)
$("verifyBtn").addEventListener("click", () => {
  const entered = [...$("otpBoxes").children].map(b => b.value).join("");
  const err = $("err2");

  if (entered.length < 6) return (err.textContent = "Enter all 6 digits.");

  if (entered !== state.otp) {
    state.tries++;
    $("otpBoxes").classList.remove("shake"); void $("otpBoxes").offsetWidth; $("otpBoxes").classList.add("shake");
    err.textContent = state.tries >= 3
      ? "Too many wrong attempts. Tap “Resend OTP”."
      : `Wrong OTP. ${3 - state.tries} attempt${3 - state.tries === 1 ? "" : "s"} left.`;
    if (state.tries >= 3) state.otp = null;      // lock until a new OTP is sent
    return;
  }

  confirmBooking();
});

function confirmBooking() {
  const r = state.selected;
  const fare = fareFor(r, state.stop);
  const booking = {
    id: "CP" + Math.floor(1000 + Math.random() * 9000),
    rideId: r.id,
    name: state.pending.name,
    phone: state.pending.phone,
    seats: state.seatsWanted,
    stop: state.stop,
    fare,
    total: fare * state.seatsWanted
  };

  state.bookings.push(booking);
  save();
  applyBookings();
  $("sms").hidden = true;
  clearInterval(state.timer);

  $("ticket").innerHTML = `
    <div><span>Booking ID</span><b>${booking.id}</b></div>
    <div><span>Passenger</span><b>${esc(booking.name)}</b></div>
    <div><span>Driver</span><b>${r.driver} · ${r.car}</b></div>
    <div><span>${r.dir === "to" ? "Pickup" : "Drop"}</span><b>${PLACES[booking.stop].name}</b></div>
    <div><span>Time</span><b>${r.time}</b></div>
    <div><span>Seats</span><b>${booking.seats}</b></div>
    <div><span>Pay driver</span><b>₹${booking.total}</b></div>`;
  showStep(3);

  renderList(); renderDetail(); drawRoute(); renderBookings();
}

$("doneBtn").addEventListener("click", () => {
  closeModal();
  $("bookings").scrollIntoView({ behavior: "smooth" });
});

/* ---------- 7. MY BOOKINGS ---------- */
function renderBookings() {
  $("bookingCount").textContent = state.bookings.length;

  if (!state.bookings.length) {
    $("bookingList").innerHTML = `<p class="empty">No bookings yet. Choose a ride above to reserve your first seat.</p>`;
    return;
  }

  $("bookingList").innerHTML = state.bookings.map(b => {
    const r = RIDES.find(x => x.id === b.rideId);
    return `
      <article class="booking">
        <span class="id">${b.id}</span>
        <h3>${PLACES[b.stop].name.split(",")[0]} ${r.dir === "to" ? "→ LPU" : "← LPU"}</h3>
        <p>${r.driver} · ${r.car}<br>${r.time} · ${b.seats} seat${b.seats > 1 ? "s" : ""}</p>
        <div class="row"><strong>₹${b.total}</strong><button class="link cancel" data-cancel="${b.id}">Cancel</button></div>
      </article>`;
  }).join("");
}

$("bookingList").addEventListener("click", e => {
  const id = e.target.dataset.cancel;
  if (!id) return;
  state.bookings = state.bookings.filter(b => b.id !== id);
  save(); applyBookings();
  renderBookings(); renderList();
  if (state.selected) { renderDetail(); drawRoute(); }
});

/* ---------- 8. EVENTS + START-UP ---------- */
// Direction toggle
document.querySelectorAll(".toggle button").forEach(btn =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".toggle button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.dir = btn.dataset.dir;
    state.selected = null;
    $("detail").innerHTML = `<p class="muted empty">Pick a ride to see its route, fare and co-riders.</p>`;
    drawOverview();
    renderList();
  })
);

// Area dropdown
$("areaSelect").addEventListener("change", e => {
  state.area = e.target.value;
  renderList();
});

// Click a ride card (event delegation: one listener for all cards)
$("rideList").addEventListener("click", e => {
  const card = e.target.closest(".ride-card");
  if (card) selectRide(Number(card.dataset.id));
});

// Click a stop chip or the Book button inside the detail panel
$("detail").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (chip) {
    state.stop = chip.dataset.stop;
    renderDetail();
    drawRoute();
  }
  if (e.target.id === "bookBtn") openModal();
});

// Close modal / SMS popup
$("modalClose").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeModal(); });
$("smsClose").addEventListener("click", () => ($("sms").hidden = true));

// Numbers only in the phone box
$("phoneInput").addEventListener("input", e => (e.target.value = e.target.value.replace(/\D/g, "")));

// Go!
fillAreas();
applyBookings();
drawOverview();
renderList();
renderBookings();