// common.js - Helpers shared by every page:
// login session, role check, validation and small display helpers.

// ---------- Session ----------

// Returns the logged-in user (saved at login), or null if nobody is logged in
function getUser() {
  const saved = localStorage.getItem("user");
  if (saved === null) return null;
  return JSON.parse(saved);
}

// Protects a page: only users with this role may open it.
// Anyone else is sent back to the login page.
function requireRole(role) {
  const user = getUser();
  if (user === null || user.role !== role) {
    window.location.href = "login.html";
    return null;
  }

  // Show the user's name in the header and make the Logout button work
  document.getElementById("userName").textContent = user.name;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.clear(); // removes the saved user and the login token
    window.location.href = "login.html";
  });

  return user;
}

// ---------- Display helpers ----------

// Makes text safe before putting it inside HTML.
// Example: "<b>" becomes "&lt;b&gt;", so the browser shows it as text
// instead of running it as HTML (protects against HTML injection).
function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Returns a coloured label for a status.
// "Pending Approval" gets the CSS class "pending-approval" (see style.css)
function badge(status) {
  const cssClass = status.toLowerCase().replaceAll(" ", "-");
  return `<span class="badge ${cssClass}">${esc(status)}</span>`;
}

// Shows a green (success) or red (error) message for 4 seconds
function showMsg(id, text, type = "success") {
  const box = document.getElementById(id);
  box.textContent = text;
  box.className = "msg " + type;
  setTimeout(() => (box.className = "msg"), 4000);
}

// Today's date as "YYYY-MM-DD" (the format used by <input type="date">)
function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Validation ----------

// Each rule returns true when the value is valid, otherwise an error message.
//  phone: 03 followed by 9 digits        e.g. 03001234567
//  cnic : 5 digits - 7 digits - 1 digit  e.g. 35202-1234567-1
const rules = {
  required: (v) => v.trim() !== "" || "This field is required",
  phone: (v) => /^03\d{9}$/.test(v) || "Phone must be in 03XXXXXXXXX format (11 digits)",
  cnic: (v) => /^\d{5}-\d{7}-\d$/.test(v) || "CNIC must be in 12345-1234567-1 format",
  password: (v) => v.length >= 4 || "Password must be at least 4 characters",
  futureDate: (v) => v >= today() || "Date must be today or later",
};

// Checks a whole form.
// fields looks like: { phone: ["required", "phone"], password: ["required"] }
// The error for each input is shown in the element with id inputId + "Err".
// Returns true only if every field is valid.
function validateForm(fields) {
  let allValid = true;

  for (const id in fields) {
    const input = document.getElementById(id);
    const errorBox = document.getElementById(id + "Err");
    let error = "";

    // Run the rules for this field one by one; stop at the first failure
    for (const ruleName of fields[id]) {
      const result = rules[ruleName](input.value);
      if (result !== true) {
        error = result;
        break;
      }
    }

    if (errorBox) errorBox.textContent = error;

    if (error) {
      input.classList.add("invalid");   // red border
      allValid = false;
    } else {
      input.classList.remove("invalid");
    }
  }

  return allValid;
}

// Finds the item with this id in a list and returns one of its fields.
// Example: lookup(hydrants, "1", "name") -> "Gulberg Hydrant"
// Returns "-" if the id is not in the list.
function lookup(list, id, field) {
  const item = list.find((x) => x.id === id);
  return item ? item[field] : "-";
}

// ---------- Server errors ----------
// When the server refuses an action (e.g. "This tanker is already on another
// trip that day"), the error message is shown at the bottom of the screen.
window.addEventListener("unhandledrejection", (event) => {
  showToast(event.reason && event.reason.message ? event.reason.message : "Something went wrong");
});

function showToast(text) {
  let box = document.getElementById("toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    box.className = "toast";
    document.body.appendChild(box);
  }
  box.textContent = text;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 5000);
}

// ---------- Tabs ----------
// A page shows one part at a time. Each tab button has data-tab="panelId";
// pressing it shows that panel and hides the others.
function openTab(panelId) {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === panelId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => openTab(btn.dataset.tab));
});

// Shows a small number on a tab, e.g. "Booking Approvals (3)"
function setCount(id, number) {
  const el = document.getElementById(id);
  if (el) el.textContent = number > 0 ? number : "";
}

// ---------- Show / hide password ----------
// Every password box gets a small eye button. Pressing it switches the box
// between type="password" (dots) and type="text" (readable).
document.querySelectorAll('input[type="password"]').forEach((input) => {
  const wrap = document.createElement("div");
  wrap.className = "pass-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const eye = document.createElement("button");
  eye.type = "button";
  eye.className = "eye-btn";
  eye.textContent = "Show";
  eye.setAttribute("aria-label", "Show password");
  eye.addEventListener("click", () => {
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    eye.textContent = hidden ? "Hide" : "Show";
    eye.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
  });
  wrap.appendChild(eye);
});
