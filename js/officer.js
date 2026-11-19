// officer.js - Zone Officer: verifies subsidy applications, approves/rejects
// subsidised bookings, handles disputes and views (but cannot change) zone bookings.

const user = requireRole("officer");
let page = 1;          // current page of the "All bookings" table
const PAGE_SIZE = 10;  // rows per page

// The server only returns data from this officer's zone
async function load() {
  const [applications, pending, disputes] = await Promise.all([
    api.get("/subsidyApplications"),
    api.get("/bookings?type=subsidised&status=Pending%20Approval&_sort=date&_order=asc"),
    api.get("/disputes"),
  ]);

  renderApplications(applications);
  renderPending(pending);
  renderDisputes(disputes);
  loadAll();
}

function renderApplications(list) {
  setCount("cApps", list.filter((a) => a.status === "Pending").length);
  document.getElementById("appRows").innerHTML = list.length ? list.map((a) => `
    <tr>
      <td data-label="Customer">${esc(a.customerName)}</td>
      <td data-label="Category">${esc(a.category)}</td>
      <td data-label="Proof">${esc(a.proof)}</td>
      <td data-label="Status">${badge(a.status)}</td>
      <td data-label="Actions">${a.status === "Pending" ? `
        <button class="small success" onclick="decideApplication('${a.id}', '${a.customerId}', true)">Approve</button>
        <button class="small danger" onclick="decideApplication('${a.id}', '${a.customerId}', false)">Reject</button>` : "-"}
      </td>
    </tr>`).join("") : `<tr><td colspan="5">No applications</td></tr>`;
}

function renderPending(list) {
  setCount("cPending", list.length);
  document.getElementById("pendingRows").innerHTML = list.length ? list.map((b) => `
    <tr>
      <td data-label="#">${esc(b.id)}</td>
      <td data-label="Customer">${esc(b.customerName)}</td>
      <td data-label="Date">${b.date}</td>
      <td data-label="Size">${b.size}</td>
      <td data-label="Address">${esc(b.address)}</td>
      <td data-label="Actions">
        <button class="small success" onclick="decideBooking('${b.id}', 'Approved')">Approve</button>
        <button class="small danger" onclick="decideBooking('${b.id}', 'Rejected')">Reject</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="6">No bookings waiting for approval</td></tr>`;
}

function renderDisputes(list) {
  setCount("cDisputes", list.filter((d) => d.status === "Open").length);
  document.getElementById("disputeRows").innerHTML = list.length ? list.map((d) => `
    <tr>
      <td data-label="Booking">#${esc(d.bookingId)}</td>
      <td data-label="Reason">${esc(d.reason)}</td>
      <td data-label="Status">${badge(d.status)}</td>
      <td data-label="Resolution">${esc(d.resolution || "-")}</td>
      <td data-label="Actions">${d.status === "Open"
        ? `<button class="small success" onclick="resolveDispute('${d.id}')">Resolve</button>` : "-"}</td>
    </tr>`).join("") : `<tr><td colspan="5">No disputes</td></tr>`;
}

// View only: the officer can see trips and drivers but has no buttons to change them.
// Search, filter and pages are done by the database (the server), not in the browser.
async function loadAll() {
  const query = document.getElementById("search").value.trim();
  const type = document.getElementById("fType").value;

  let url = `/bookings?_page=${page}&_limit=${PAGE_SIZE}&_sort=createdAt&_order=desc`;
  if (query) url += `&q=${encodeURIComponent(query)}`;
  if (type) url += `&type=${type}`;

  const result = await api.getPage(url); // { rows, total }
  const list = result.rows;

  document.getElementById("allRows").innerHTML = list.length ? list.map((b) => `
    <tr>
      <td data-label="#">${esc(b.id)}</td>
      <td data-label="Customer">${esc(b.customerName)}</td>
      <td data-label="Date">${b.date}</td>
      <td data-label="Type">${b.type}</td>
      <td data-label="Size">${b.size}</td>
      <td data-label="Driver">${esc(b.driverName || "-")}</td>
      <td data-label="Status">${badge(b.status)}</td>
    </tr>`).join("") : `<tr><td colspan="7">No bookings found</td></tr>`;

  renderPager(result.total);
}

// Previous / Next buttons for the pages
function renderPager(total) {
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  document.getElementById("pager").innerHTML = `
    <button class="small light" onclick="goToPage(${page - 1})" ${page <= 1 ? "disabled" : ""}>Previous</button>
    <span class="muted">Page ${page} of ${pages} (${total} bookings)</span>
    <button class="small light" onclick="goToPage(${page + 1})" ${page >= pages ? "disabled" : ""}>Next</button>`;
}

function goToPage(n) {
  page = n;
  loadAll();
}

async function decideApplication(appId, customerId, approve) {
  // The server also marks the customer as subsidised (same transaction)
  await api.patch(`/subsidyApplications/${appId}`, { status: approve ? "Approved" : "Rejected" });
  showMsg("msg", approve ? "Subsidy application approved" : "Subsidy application rejected");
  load();
}

async function decideBooking(id, status) {
  await api.patch(`/bookings/${id}`, { status: status });
  showMsg("msg", `Booking #${id} ${status.toLowerCase()}`);
  load();
}

async function resolveDispute(id) {
  const note = prompt("How was this dispute resolved?");
  if (!note || !note.trim()) return;
  await api.patch(`/disputes/${id}`, { resolution: note.trim() });
  showMsg("msg", "Dispute resolved");
  load();
}

// A new search or filter starts again from page 1
document.getElementById("search").addEventListener("input", () => { page = 1; loadAll(); });
document.getElementById("fType").addEventListener("change", () => { page = 1; loadAll(); });
load();
