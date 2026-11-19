// customer.js - Customer dashboard: book tankers, cancel, confirm/dispute delivery,
// apply for subsidy, view history and bill.

const user = requireRole("customer");
let rates = [], hydrants = [], tankers = [], myBookings = [];

const STATUSES = [
  "Pending Approval", "Approved", "Assigned", "Filled", "Dispatched", "Arrived",
  "Delivered", "Confirmed", "Failed", "Disputed", "Rejected", "Cancelled",
];


// ---------- Page load ----------
async function init() {
  // Reload the user from the API (subsidy status may have changed)
  const freshUser = await api.get(`/users/${user.id}`);
  user.subsidised = freshUser.subsidised;
  user.monthlyLimit = freshUser.monthlyLimit;

  const zone = await api.get(`/zones/${user.zoneId}`);
  [rates, hydrants, tankers] = await Promise.all([
    api.get("/rates"),
    api.get("/hydrants"),
    api.get("/tankers"),
  ]);

  // Only the available hydrants that serve this customer's zone
  const zoneHydrants = hydrants.filter((h) => zone.hydrantIds.includes(h.id) && h.available);
  document.getElementById("hydrant").innerHTML += zoneHydrants
    .map((h) => `<option value="${h.id}">${esc(h.name)} (${h.openTime} - ${h.closeTime})</option>`)
    .join("");

  document.getElementById("size").innerHTML += rates
    .map((r) => `<option value="${r.size}">${r.size} gallons</option>`)
    .join("");

  // Subsidised option is shown only to approved subsidised customers
  if (user.subsidised) {
    document.getElementById("type").innerHTML += `<option value="subsidised">Subsidised</option>`;
  }

  document.getElementById("address").value = user.address || "";
  document.getElementById("date").min = today();
  document.getElementById("filterStatus").innerHTML += STATUSES
    .map((s) => `<option>${s}</option>`)
    .join("");

  renderSubsidy();
  loadBookings();
}

// ---------- Price ----------
function calcPrice() {
  const size = Number(document.getElementById("size").value);
  const type = document.getElementById("type").value;
  const rate = rates.find((r) => r.size === size);
  const price = rate ? rate[type] : 0;
  document.getElementById("price").textContent = price;
  return price;
}
document.getElementById("size").addEventListener("change", calcPrice);
document.getElementById("type").addEventListener("change", calcPrice);

// ---------- Create booking ----------
document.getElementById("bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const isValid = validateForm({
    hydrant: ["required"],
    size: ["required"],
    date: ["required", "futureDate"],
    address: ["required"],
  });
  if (!isValid) return;

  const hydrantId = document.getElementById("hydrant").value;
  const size = Number(document.getElementById("size").value);
  const type = document.getElementById("type").value;
  const date = document.getElementById("date").value;

  try {
    // The server checks every rule (zone, hydrant quota, subsidy, monthly limit)
    // and sets the price and status itself.
    const booking = await api.post("/bookings", {
      hydrantId: hydrantId,
      type: type,
      size: size,
      date: date,
      address: document.getElementById("address").value.trim(),
    });

    showMsg("bookMsg", booking.status === "Pending Approval"
      ? "Booking created. Waiting for Zone Officer approval."
      : "Booking confirmed!");
    e.target.reset();
    document.getElementById("address").value = user.address || "";
    document.getElementById("price").textContent = 0;
    loadBookings();
    setTimeout(() => openTab("t-bookings"), 1200); // show the new booking in the list
  } catch (err) {
    showMsg("bookMsg", err.message, "error"); // the reason sent by the server
  }
});

// ---------- Booking list ----------
async function loadBookings() {
  myBookings = await api.get(`/bookings?customerId=${user.id}&_sort=createdAt&_order=desc`);
  renderBookings();
}

function renderBookings() {
  const filter = document.getElementById("filterStatus").value;
  const list = filter ? myBookings.filter((b) => b.status === filter) : myBookings;
  setCount("cBookings", myBookings.length);
  const hydrantName = (id) => lookup(hydrants, id, "name");
  const tankerNumber = (id) => lookup(tankers, id, "number");

  document.getElementById("bookingRows").innerHTML = list.length
    ? list.map((b) => `
      <tr>
        <td data-label="#">${esc(b.id)}</td>
        <td data-label="Date">${b.date}</td>
        <td data-label="Hydrant">${esc(hydrantName(b.hydrantId))}</td>
        <td data-label="Size">${b.size}</td>
        <td data-label="Type">${b.type}</td>
        <td data-label="Price">Rs ${b.price}</td>
        <td data-label="Tanker">${esc(tankerNumber(b.tankerId))}</td>
        <td data-label="Status">${badge(b.status)}${b.failReason ? `<br><small>${esc(b.failReason)}</small>` : ""}</td>
        <td data-label="Actions">${actionsFor(b)}</td>
      </tr>`).join("")
    : `<tr><td colspan="9">No bookings found</td></tr>`;

  const total = myBookings
    .filter((b) => ["Delivered", "Confirmed"].includes(b.status))
    .reduce((sum, b) => sum + b.price, 0);
  document.getElementById("totalBill").textContent = total;
}

// Buttons depend on the booking status (status-based actions)
function actionsFor(b) {
  let html = "";
  if (["Pending Approval", "Approved", "Assigned"].includes(b.status)) {
    html += `<button class="small danger" onclick="cancelBooking('${b.id}')">Cancel</button>`;
  }
  if (b.status === "Delivered") {
    html += `<button class="small success" onclick="setStatus('${b.id}', 'Confirmed')">Confirm</button>`;
    html += `<button class="small danger" onclick="dispute('${b.id}')">Dispute</button>`;
  }
  return html || "-";
}

async function cancelBooking(id) {
  if (!confirm("Are you sure you want to cancel this booking?")) return;
  await setStatus(id, "Cancelled");
}

async function setStatus(id, status) {
  await api.patch(`/bookings/${id}`, { status });
  showMsg("listMsg", `Booking #${id} is now ${status}`);
  loadBookings();
}

async function dispute(id) {
  const reason = prompt("Why are you disputing this delivery?");
  if (!reason || !reason.trim()) return;
  // The server saves the dispute and marks the booking "Disputed" in one transaction
  await api.post("/disputes", { bookingId: id, reason: reason.trim() });
  showMsg("listMsg", `Booking #${id} is now Disputed`);
  loadBookings();
}

document.getElementById("filterStatus").addEventListener("change", renderBookings);

// ---------- Subsidy ----------
async function renderSubsidy() {
  const box = document.getElementById("subsidyBox");

  if (user.subsidised) {
    box.innerHTML = `<p>✅ You are a subsidised customer. Monthly limit: <b>${user.monthlyLimit || 4}</b> tankers.</p>`;
    return;
  }

  const applications = await api.get(`/subsidyApplications?customerId=${user.id}`);
  const last = applications[applications.length - 1];

  if (last && last.status === "Pending") {
    box.innerHTML = `<p>Your subsidy application is ${badge("Pending")}.</p>`;
    return;
  }

  box.innerHTML = `
    ${last ? `<p>Last application: ${badge(last.status)}</p>` : "<p>Apply if you are a low income household, hospital or mosque.</p>"}
    <form id="subForm" novalidate>
      <div class="field">
        <label for="category">Category</label>
        <select id="category">
          <option value="">-- Select category --</option>
          <option>Low Income Household</option>
          <option>Hospital</option>
          <option>Mosque</option>
        </select>
        <span class="err" id="categoryErr"></span>
      </div>
      <div class="field">
        <label for="proof">Proof Details (e.g. BISP card number)</label>
        <input id="proof" />
        <span class="err" id="proofErr"></span>
      </div>
      <button type="submit">Apply for Subsidy</button>
    </form>`;

  document.getElementById("subForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm({ category: ["required"], proof: ["required"] })) return;
    await api.post("/subsidyApplications", {
      category: document.getElementById("category").value,
      proof: document.getElementById("proof").value.trim(),
    });
    renderSubsidy();
  });
}

init();
