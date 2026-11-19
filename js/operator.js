// operator.js - Hydrant Operator: assigns tanker + driver to approved bookings,
// records fill and departure, marks tankers or the hydrant unavailable.

const user = requireRole("operator");
const HYDRANT_ID = user.hydrantId;
let hydrant, tankers = [], drivers = [], bookings = [];

// While a booking is in one of these statuses, its tanker and driver are busy
const ACTIVE = ["Assigned", "Filled", "Dispatched", "Arrived"];
const INACTIVE = ["Cancelled", "Rejected", "Failed"];

document.getElementById("fDate").value = today();

async function load() {
  [hydrant, tankers, drivers, bookings] = await Promise.all([
    api.get(`/hydrants/${HYDRANT_ID}`),
    api.get(`/tankers?hydrantId=${HYDRANT_ID}`),
    api.get(`/users?role=driver&hydrantId=${HYDRANT_ID}`),
    api.get(`/bookings?hydrantId=${HYDRANT_ID}&_sort=date&_order=asc`),
  ]);
  renderHydrant();
  renderBookings();
  renderTankers();
}

function renderHydrant() {
  const date = document.getElementById("fDate").value;
  const used = bookings
    .filter((b) => b.date === date && !INACTIVE.includes(b.status))
    .reduce((sum, b) => sum + b.size, 0);

  document.getElementById("hydrantTitle").textContent =
    `${hydrant.name} (${hydrant.openTime} - ${hydrant.closeTime})`;
  document.getElementById("stats").innerHTML = `
    <div class="stat"><b>${hydrant.dailyQuota}</b>Daily quota (gal)</div>
    <div class="stat"><b>${used}</b>Booked on ${date || "-"}</div>
    <div class="stat"><b>${hydrant.dailyQuota - used}</b>Remaining (gal)</div>
    <div class="stat"><b>${hydrant.available ? "Open" : "Closed"}</b>Hydrant status</div>`;

  const btn = document.getElementById("toggleHydrant");
  btn.textContent = hydrant.available ? "Mark Hydrant Unavailable" : "Mark Hydrant Available";
  btn.className = hydrant.available ? "danger" : "success";
}

function renderBookings() {
  const date = document.getElementById("fDate").value;
  const visible = ["Approved", "Assigned", "Filled", "Dispatched", "Arrived", "Delivered", "Confirmed", "Failed", "Disputed"];
  const list = bookings.filter((b) => (!date || b.date === date) && visible.includes(b.status));
  setCount("cWork", list.filter((b) => ["Approved", "Assigned", "Filled"].includes(b.status)).length);
  const tankerNumber = (id) => lookup(tankers, id, "number");
  const driverName = (id) => lookup(drivers, id, "name");

  document.getElementById("rows").innerHTML = list.length ? list.map((b) => `
    <tr>
      <td data-label="#">${esc(b.id)}</td>
      <td data-label="Date">${b.date}</td>
      <td data-label="Size">${b.size}</td>
      <td data-label="Address">${esc(b.address)}</td>
      <td data-label="Status">${badge(b.status)}</td>
      <td data-label="Tanker / Driver">${esc(tankerNumber(b.tankerId))} / ${esc(driverName(b.driverId))}</td>
      <td data-label="Actions">${actionsFor(b)}</td>
    </tr>`).join("") : `<tr><td colspan="7">No bookings for this date</td></tr>`;
}

// A tanker is free if it is available, the right size, and not on another active trip that day
function freeTankers(b) {
  return tankers.filter((t) => t.available && t.size === b.size &&
    !bookings.some((x) => x.id !== b.id && x.date === b.date && x.tankerId === t.id && ACTIVE.includes(x.status)));
}

// A driver is free if not on another active trip that day
function freeDrivers(b) {
  return drivers.filter((d) =>
    !bookings.some((x) => x.id !== b.id && x.date === b.date && x.driverId === d.id && ACTIVE.includes(x.status)));
}

function actionsFor(b) {
  if (b.status === "Approved") {
    if (!hydrant.available) return "Hydrant is unavailable";
    const ts = freeTankers(b), ds = freeDrivers(b);
    if (!ts.length) return "No free tanker of this size";
    if (!ds.length) return "No free driver";
    return `
      <select id="t${b.id}" aria-label="Tanker">${ts.map((t) => `<option value="${t.id}">${esc(t.number)}</option>`).join("")}</select>
      <select id="d${b.id}" aria-label="Driver">${ds.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select>
      <button class="small" onclick="assign('${b.id}')">Assign</button>`;
  }
  if (b.status === "Assigned") {
    return `<button class="small" onclick="update('${b.id}', 'Filled', { filledAt: new Date().toISOString() })">Mark Filled</button>`;
  }
  if (b.status === "Filled") {
    return `<button class="small" onclick="update('${b.id}', 'Dispatched', { dispatchedAt: new Date().toISOString() })">Left Hydrant</button>`;
  }
  return "-";
}

async function assign(id) {
  const tankerId = document.getElementById("t" + id).value;
  const driverId = document.getElementById("d" + id).value;

  // Re-check with fresh data so the same tanker/driver is not promised twice.
  // (The real guarantee will come from a database transaction in the backend.)
  const fresh = await api.get(`/bookings?hydrantId=${HYDRANT_ID}`);
  const booking = fresh.find((x) => x.id === id);
  const clash = fresh.some((x) => x.id !== id && x.date === booking.date && ACTIVE.includes(x.status) &&
    (x.tankerId === tankerId || x.driverId === driverId));
  if (clash) {
    showMsg("msg", "That tanker or driver was just assigned to another trip. Please choose again.", "error");
    return load();
  }

  await update(id, "Assigned", { tankerId, driverId, assignedAt: new Date().toISOString() });
}

async function update(id, status, extra = {}) {
  extra.status = status; // add the new status to the data we send
  await api.patch(`/bookings/${id}`, extra);
  showMsg("msg", `Booking #${id} is now ${status}`);
  load();
}

function renderTankers() {
  document.getElementById("tankerRows").innerHTML = tankers.map((t) => `
    <tr>
      <td data-label="Number">${esc(t.number)}</td>
      <td data-label="Size">${t.size}</td>
      <td data-label="Available">${t.available ? "✅ Yes" : "❌ No"}</td>
      <td data-label="Action">
        <button class="small ${t.available ? "danger" : "success"}" onclick="toggleTanker('${t.id}', ${!t.available})">
          ${t.available ? "Mark Unavailable" : "Mark Available"}
        </button>
      </td>
    </tr>`).join("");
}

async function toggleTanker(id, available) {
  await api.patch(`/tankers/${id}`, { available });
  load();
}

document.getElementById("toggleHydrant").addEventListener("click", async () => {
  await api.patch(`/hydrants/${HYDRANT_ID}`, { available: !hydrant.available });
  load();
});

document.getElementById("fDate").addEventListener("change", () => {
  renderHydrant();
  renderBookings();
});

load();
