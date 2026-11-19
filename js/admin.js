// admin.js - Administrator: sets up everything in PaaniLink (zones, hydrants with
// quota and timings, staff, tankers, rates) and sees the city report.
// Each part has its own tab. Every list has Add, Edit and Delete.

const me = requireRole("admin");
let data = {};

async function load() {
  const [zones, hydrants, tankers, rates, report, users] = await Promise.all(
    ["/zones", "/hydrants", "/tankers", "/rates", "/reports/summary", "/users?_limit=100000"].map((p) => api.get(p))
  );
  data = { zones, hydrants, tankers, rates, report, users };
  renderReport();
  renderHydrants();
  renderZones();
  STAFF.forEach(renderStaff);
  renderTankers();
  renderCustomers();
  renderRates();
}

const val = (id) => document.getElementById(id).value.trim();
const hydrantName = (id) => lookup(data.hydrants, id, "name");
const zoneName = (id) => lookup(data.zones, id, "name");
const options = (list) => list.map((x) => `<option value="${x.id}">${esc(x.name || x.number)}</option>`).join("");

// Runs a server request; shows the server's error message if it is refused
async function save(request, okText) {
  try {
    await request;
  } catch (err) {
    showMsg("msg", err.message, "error");
    showToast(err.message); // also shown at the bottom, so it is seen even after scrolling
    return false;
  }
  showMsg("msg", okText);
  await load();
  return true;
}

// Switches a form between "Add" and "Edit" mode
function setMode(prefix, editing, label) {
  document.getElementById(prefix + "Btn").textContent = editing ? "Save Changes" : "Add " + label;
  document.getElementById(prefix + "Title").textContent = (editing ? "Edit " : "Add ") + label;
  document.getElementById(prefix + "Cancel").classList.toggle("hidden", !editing);
}

async function removeItem(path, text) {
  if (!confirm(text)) return;
  await save(api.del(path), "Deleted");
}

// ---------- Report (numbers come from COUNT / SUM queries on the server) ----------
function renderReport() {
  const t = data.report.totals;
  document.getElementById("stats").innerHTML = `
    <div class="stat"><b>${t.totalBookings}</b>Total bookings</div>
    <div class="stat"><b>${t.pendingApproval}</b>Pending approval</div>
    <div class="stat"><b>${t.delivered}</b>Delivered</div>
    <div class="stat"><b>${t.failed}</b>Failed</div>
    <div class="stat"><b>${t.disputed}</b>Disputed</div>
    <div class="stat"><b>${t.subsidised}</b>Subsidised</div>
    <div class="stat"><b>${t.gallonsDelivered}</b>Gallons delivered</div>
    <div class="stat"><b>Rs ${t.revenue}</b>Revenue</div>`;
  document.getElementById("byHydrantRows").innerHTML = data.report.byHydrant.map((h) => `
    <tr>
      <td data-label="Hydrant">${esc(h.hydrantName)}</td>
      <td data-label="Daily Quota">${h.dailyQuota}</td>
      <td data-label="Bookings">${h.bookings}</td>
      <td data-label="Gallons Delivered">${h.gallonsDelivered}</td>
    </tr>`).join("") || `<tr><td colspan="4">No hydrants yet</td></tr>`;
}

// ---------- Hydrants: name, daily quota, timings, open/closed ----------
let editHydrant = null;

function renderHydrants() {
  setCount("cHydrants", data.hydrants.length);
  document.getElementById("hydRows").innerHTML = data.hydrants.map((h) => `
    <tr>
      <td data-label="Name">${esc(h.name)}</td>
      <td data-label="Daily Quota">${h.dailyQuota} gal</td>
      <td data-label="Timings">${h.openTime} - ${h.closeTime}</td>
      <td data-label="Status">${h.available ? "Open" : "Closed"}</td>
      <td><button class="small" onclick="startEditHydrant('${h.id}')">Edit</button>
          <button class="small danger" onclick="removeItem('/hydrants/${h.id}', 'Delete hydrant ${esc(h.name)}?')">Delete</button></td>
    </tr>`).join("") || `<tr><td colspan="5">No hydrants yet. Add your first hydrant above.</td></tr>`;
  document.getElementById("tHyd").innerHTML = options(data.hydrants);
}

function startEditHydrant(id) {
  const h = data.hydrants.find((x) => x.id === id);
  editHydrant = id;
  document.getElementById("hName").value = h.name;
  document.getElementById("hQuota").value = h.dailyQuota;
  document.getElementById("hOpen").value = h.openTime;
  document.getElementById("hClose").value = h.closeTime;
  document.getElementById("hAvail").value = h.available ? "1" : "0";
  setMode("hyd", true, "Hydrant");
  document.getElementById("hydForm").scrollIntoView({ behavior: "smooth" });
}

function resetHydrantForm() {
  editHydrant = null;
  document.getElementById("hydForm").reset();
  setMode("hyd", false, "Hydrant");
}
document.getElementById("hydCancel").addEventListener("click", resetHydrantForm);

document.getElementById("hydForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm({ hName: ["required"], hQuota: ["required"], hOpen: ["required"], hClose: ["required"] })) return;
  const hydrant = {
    name: val("hName"),
    dailyQuota: Number(val("hQuota")),
    openTime: val("hOpen"),
    closeTime: val("hClose"),
    available: val("hAvail") === "1",
  };
  if (hydrant.dailyQuota <= 0) return showMsg("msg", "Daily quota must be a positive number", "error");
  if (hydrant.openTime >= hydrant.closeTime) return showMsg("msg", "Closing time must be after opening time", "error");

  const request = editHydrant ? api.patch(`/hydrants/${editHydrant}`, hydrant) : api.post("/hydrants", hydrant);
  if (await save(request, editHydrant ? "Hydrant updated" : "Hydrant added")) resetHydrantForm();
});

// ---------- Zones: name + which hydrants serve it ----------
let editZone = null;

function renderZones() {
  setCount("cZones", data.zones.length);
  document.getElementById("zHydrants").innerHTML = data.hydrants
    .map((h) => `<label class="check"><input type="checkbox" value="${h.id}" /> ${esc(h.name)}</label>`).join("")
    || "Add a hydrant first";
  document.getElementById("zoneRows").innerHTML = data.zones.map((z) => `
    <tr>
      <td data-label="Name">${esc(z.name)}</td>
      <td data-label="Hydrants">${z.hydrantIds.map((id) => esc(hydrantName(id))).join(", ")}</td>
      <td><button class="small" onclick="startEditZone('${z.id}')">Edit</button>
          <button class="small danger" onclick="removeItem('/zones/${z.id}', 'Delete zone ${esc(z.name)}?')">Delete</button></td>
    </tr>`).join("") || `<tr><td colspan="3">No zones yet</td></tr>`;
}

function startEditZone(id) {
  const z = data.zones.find((x) => x.id === id);
  editZone = id;
  document.getElementById("zName").value = z.name;
  document.querySelectorAll("#zHydrants input").forEach((box) => { box.checked = z.hydrantIds.includes(box.value); });
  setMode("zone", true, "Zone");
  document.getElementById("zoneForm").scrollIntoView({ behavior: "smooth" });
}

function resetZoneForm() {
  editZone = null;
  document.getElementById("zoneForm").reset();
  setMode("zone", false, "Zone");
}
document.getElementById("zoneCancel").addEventListener("click", resetZoneForm);

document.getElementById("zoneForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm({ zName: ["required"] })) return;
  const hydrantIds = Array.from(document.querySelectorAll("#zHydrants input:checked")).map((box) => box.value);
  if (!hydrantIds.length) return showMsg("msg", "Tick at least one hydrant for the zone", "error");
  const zone = { name: val("zName"), hydrantIds };
  const request = editZone ? api.patch(`/zones/${editZone}`, zone) : api.post("/zones", zone);
  if (await save(request, editZone ? "Zone updated" : "Zone added")) resetZoneForm();
});

// ---------- Staff: zone officers, hydrant operators, drivers ----------
// The three tabs work the same way, so one set of functions handles all of them.
// Officers are linked to a zone; operators and drivers to a hydrant.
const STAFF = ["officer", "operator", "driver", "admin"];
const LABEL = { officer: "Zone Officer", operator: "Hydrant Operator", driver: "Driver", admin: "Administrator" };
const COUNT_ID = { officer: "cOfficer", operator: "cOperator", driver: "cDriver", admin: "cAdmin" };
const editStaff = {};

// Officers get a zone, operators and drivers a hydrant, administrators nothing
const linkList = (role) => (role === "officer" ? data.zones : role === "admin" ? [] : data.hydrants);
const linkName = (u) => (u.zoneId ? zoneName(u.zoneId) : u.hydrantId ? hydrantName(u.hydrantId) : "-");

function renderStaff(role) {
  const search = val(role + "Search").toLowerCase();
  const people = data.users.filter((u) => u.role === role);
  const shown = people.filter((u) => !search || u.name.toLowerCase().includes(search) || u.phone.includes(search));
  setCount(COUNT_ID[role], people.length);

  const select = document.getElementById(role + "Link");
  const keep = select.value;
  select.innerHTML = role === "admin" ? `<option value="">Whole city</option>` : options(linkList(role));
  if (keep) select.value = keep;

  document.getElementById(role + "Rows").innerHTML = shown.map((u) => `
    <tr>
      <td data-label="Name">${esc(u.name)}</td>
      <td data-label="Phone">${esc(u.phone)}</td>
      <td data-label="CNIC">${esc(u.cnic)}</td>
      <td data-label="${role === "officer" ? "Zone" : "Hydrant"}">${esc(linkName(u))}</td>
      <td><button class="small" onclick="startEditStaff('${role}', '${u.id}')">Edit</button>
          ${u.id === me.id ? "(you)" : `<button class="small danger" onclick="removeItem('/users/${u.id}', 'Delete ${LABEL[role]} ${esc(u.name)}?')">Delete</button>`}</td>
    </tr>`).join("") || `<tr><td colspan="5">No ${LABEL[role]}s yet</td></tr>`;
}

function startEditStaff(role, id) {
  const u = data.users.find((x) => x.id === id);
  editStaff[role] = id;
  document.getElementById(role + "Name").value = u.name;
  document.getElementById(role + "Phone").value = u.phone;
  document.getElementById(role + "Cnic").value = u.cnic;
  // The admin sees the current password, and can change it here
  document.getElementById(role + "Pass").value = u.password || "";
  document.getElementById(role + "Pass").placeholder = "Leave empty to keep the old one";
  document.getElementById(role + "Link").value = u.zoneId || u.hydrantId || "";
  // Phone and CNIC identify the person, so they are not changed here
  document.getElementById(role + "Phone").disabled = true;
  document.getElementById(role + "Cnic").disabled = true;
  setMode(role, true, LABEL[role]);
  document.getElementById(role + "Form").scrollIntoView({ behavior: "smooth" });
}

function resetStaffForm(role) {
  editStaff[role] = null;
  document.getElementById(role + "Form").reset();
  document.getElementById(role + "Phone").disabled = false;
  document.getElementById(role + "Cnic").disabled = false;
  document.getElementById(role + "Pass").placeholder = "";
  setMode(role, false, LABEL[role]);
}

STAFF.forEach((role) => {
  setMode(role, false, LABEL[role]);
  document.getElementById(role + "Search").addEventListener("input", () => renderStaff(role));
  document.getElementById(role + "Cancel").addEventListener("click", () => resetStaffForm(role));

  document.getElementById(role + "Form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editing = editStaff[role];
    const link = role === "officer" ? "zoneId" : "hydrantId";
    const checks = { [role + "Name"]: ["required"] };
    if (role !== "admin") checks[role + "Link"] = ["required"];
    if (!editing) {
      Object.assign(checks, {
        [role + "Phone"]: ["required", "phone"], [role + "Cnic"]: ["required", "cnic"], [role + "Pass"]: ["required", "password"],
      });
    } else if (val(role + "Pass")) {
      checks[role + "Pass"] = ["password"];
    }
    if (!validateForm(checks)) return;

    let request;
    if (editing) {
      const changes = { name: val(role + "Name") };
      if (role !== "admin") changes[link] = val(role + "Link");
      if (val(role + "Pass")) changes.password = val(role + "Pass");
      request = api.patch(`/users/${editing}`, changes);
    } else {
      request = api.post("/users", {
        name: val(role + "Name"), phone: val(role + "Phone"), cnic: val(role + "Cnic"),
        password: val(role + "Pass"), role, ...(role !== "admin" && { [link]: val(role + "Link") }),
      }); // the server refuses a duplicate phone or CNIC
    }
    if (await save(request, editing ? `${LABEL[role]} updated` : `${LABEL[role]} added`)) resetStaffForm(role);
  });
});

// ---------- Tankers ----------
let editTanker = null;

function renderTankers() {
  setCount("cTankers", data.tankers.length);
  document.getElementById("tankRows").innerHTML = data.tankers.map((t) => `
    <tr>
      <td data-label="Number">${esc(t.number)}</td>
      <td data-label="Size">${t.size} gal</td>
      <td data-label="Hydrant">${esc(hydrantName(t.hydrantId))}</td>
      <td data-label="Status">${t.available ? "Available" : "Not available"}</td>
      <td><button class="small" onclick="startEditTanker('${t.id}')">Edit</button>
          <button class="small danger" onclick="removeItem('/tankers/${t.id}', 'Delete tanker ${esc(t.number)}?')">Delete</button></td>
    </tr>`).join("") || `<tr><td colspan="5">No tankers yet</td></tr>`;
}

function startEditTanker(id) {
  const t = data.tankers.find((x) => x.id === id);
  editTanker = id;
  document.getElementById("tNum").value = t.number;
  document.getElementById("tSize").value = String(t.size);
  document.getElementById("tHyd").value = t.hydrantId;
  setMode("tank", true, "Tanker");
  document.getElementById("tankForm").scrollIntoView({ behavior: "smooth" });
}

function resetTankerForm() {
  editTanker = null;
  document.getElementById("tankForm").reset();
  setMode("tank", false, "Tanker");
}
document.getElementById("tankCancel").addEventListener("click", resetTankerForm);

document.getElementById("tankForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm({ tNum: ["required"], tHyd: ["required"] })) return;
  const tanker = { number: val("tNum"), size: Number(val("tSize")), hydrantId: val("tHyd") };
  if (data.tankers.some((t) => t.number === tanker.number && t.id !== editTanker)) {
    return showMsg("msg", "A tanker with this number already exists", "error");
  }
  const request = editTanker ? api.patch(`/tankers/${editTanker}`, tanker) : api.post("/tankers", tanker);
  if (await save(request, editTanker ? "Tanker updated" : "Tanker added")) resetTankerForm();
});

// ---------- Customers (they register themselves; admin can only delete) ----------
function renderCustomers() {
  const search = val("customerSearch").toLowerCase();
  const all = data.users.filter((u) => u.role === "customer");
  setCount("cCustomer", all.length);
  const shown = all.filter((u) => !search || u.name.toLowerCase().includes(search) || u.phone.includes(search));
  document.getElementById("customerRows").innerHTML = shown.map((u) => `
    <tr>
      <td data-label="Name">${esc(u.name)}</td>
      <td data-label="Phone">${esc(u.phone)}</td>
      <td data-label="CNIC">${esc(u.cnic)}</td>
      <td data-label="Zone">${esc(u.zoneId ? zoneName(u.zoneId) : "-")}</td>
      <td><button class="small danger" onclick="removeItem('/users/${u.id}',
        'Delete customer ${esc(u.name)}?\\n\\nAll of their bookings, subsidy requests and complaints will also be deleted.')">Delete</button></td>
    </tr>`).join("") || `<tr><td colspan="5">No customers yet</td></tr>`;
}
document.getElementById("customerSearch").addEventListener("input", renderCustomers);

// ---------- Rates ----------
function renderRates() {
  document.getElementById("rateRows").innerHTML = data.rates.map((r) => `
    <tr>
      <td data-label="Size">${r.size} gal</td>
      <td data-label="Commercial"><input type="number" id="rc${r.id}" value="${r.commercial}" aria-label="Commercial rate for ${r.size}" /></td>
      <td data-label="Subsidised"><input type="number" id="rs${r.id}" value="${r.subsidised}" aria-label="Subsidised rate for ${r.size}" /></td>
      <td><button class="small" onclick="saveRate('${r.id}')">Save</button></td>
    </tr>`).join("");
}

async function saveRate(id) {
  const commercial = Number(val("rc" + id));
  const subsidised = Number(val("rs" + id));
  if (commercial <= 0 || subsidised <= 0) return showMsg("msg", "Rates must be positive numbers", "error");
  if (subsidised >= commercial) return showMsg("msg", "Subsidised rate must be lower than the commercial rate", "error");
  await save(api.patch(`/rates/${id}`, { commercial, subsidised }), "Rate saved");
}

load();
