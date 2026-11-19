// mock-server.js - Phase 1 mock API.
// The website (HTML, CSS, JS) is exactly the same as in Phase 2.
// Only the server behind /api is different: here json-server keeps the data
// in db.json, and a few small handlers below act like the real backend
// (login, register, booking price, booking history and the report).

const jsonServer = require("json-server");

const server = jsonServer.create();
const router = jsonServer.router("db.json");
const db = router.db; // lowdb: db.get("users").value() reads, .push(), .find(), .assign() write

server.use(jsonServer.defaults({ static: "." })); // serves the website files too
server.use(jsonServer.bodyParser);

const PORT = process.env.PORT || 3000;

// ---------- Small helpers ----------
const now = () => new Date().toISOString();
const fail = (res, status, message) => res.status(status).json({ error: message });

// Every new record gets a text id ("1", "2", ...) like the Phase 2 backend
function nextId(collection) {
  const ids = db.get(collection).value().map((x) => Number(x.id) || 0);
  return String(Math.max(0, ...ids) + 1);
}

// Removes the password before a user is sent to the browser
function safeUser(user) {
  const copy = { ...user };
  delete copy.password;
  return copy;
}

// The token is simply "mock-" + the user's id (a real backend uses JWT)
function currentUser(req) {
  const token = (req.headers.authorization || "").replace("Bearer mock-", "");
  return db.get("users").find({ id: token }).value();
}

// ---------- Login and register ----------
server.post("/api/auth/login", (req, res) => {
  const user = db.get("users").find({ phone: req.body.phone, password: req.body.password }).value();
  if (!user) return fail(res, 401, "Wrong phone number or password");
  res.json({ token: "mock-" + user.id, user: safeUser(user) });
});

server.post("/api/auth/register", (req, res) => {
  const b = req.body;
  const users = db.get("users");
  if (users.find({ phone: b.phone }).value()) return fail(res, 409, "This phone number is already registered");
  if (users.find({ cnic: b.cnic }).value()) return fail(res, 409, "This CNIC is already registered");
  const user = {
    id: nextId("users"), name: b.name, phone: b.phone, cnic: b.cnic, password: b.password,
    role: "customer", zoneId: b.zoneId, hydrantId: null, address: b.address || "",
    subsidised: false, monthlyLimit: null,
  };
  users.push(user).write();
  res.status(201).json({ token: "mock-" + user.id, user: safeUser(user) });
});

// Everything else under /api needs a logged-in user, except reading zones and rates
server.use("/api", (req, res, next) => {
  const isPublic = req.method === "GET" && (req.path.startsWith("/zones") || req.path.startsWith("/rates"));
  req.user = currentUser(req);
  if (!req.user && !isPublic) return fail(res, 401, "Please log in first");
  next();
});

// ---------- Report (counts and sums, like the SQL report in Phase 2) ----------
server.get("/api/reports/summary", (req, res) => {
  const bookings = db.get("bookings").value();
  const count = (test) => bookings.filter(test).length;
  const done = (b) => b.status === "Delivered" || b.status === "Confirmed";

  const totals = {
    totalBookings: bookings.length,
    pendingApproval: count((b) => b.status === "Pending Approval"),
    delivered: count(done),
    failed: count((b) => b.status === "Failed"),
    disputed: count((b) => b.status === "Disputed"),
    subsidised: count((b) => b.type === "subsidised"),
    gallonsDelivered: bookings.filter(done).reduce((sum, b) => sum + b.size, 0),
    revenue: bookings.filter(done).reduce((sum, b) => sum + b.price, 0),
  };
  const byHydrant = db.get("hydrants").value().map((h) => {
    const mine = bookings.filter((b) => b.hydrantId === h.id);
    return {
      id: h.id, hydrantName: h.name, dailyQuota: h.dailyQuota, bookings: mine.length,
      gallonsDelivered: mine.filter(done).reduce((sum, b) => sum + b.size, 0),
    };
  });
  res.json({ totals, byHydrant });
});

// ---------- Bookings ----------
function addHistory(bookingId, status, user) {
  db.get("bookingHistory")
    .push({ id: nextId("bookingHistory"), bookingId, status, byName: user.name, at: now() })
    .write();
}

server.get("/api/bookings/:id/history", (req, res) => {
  res.json(db.get("bookingHistory").filter({ bookingId: req.params.id }).value());
});

// A new booking: the price and the first status are decided here, not in the browser
server.post("/api/bookings", (req, res) => {
  const user = req.user;
  const b = req.body;
  const zone = db.get("zones").find({ id: String(user.zoneId) }).value();
  const hydrant = db.get("hydrants").find({ id: String(b.hydrantId) }).value();
  const rate = db.get("rates").find({ size: Number(b.size) }).value();

  if (!zone || !hydrant || !rate) return fail(res, 400, "Choose a size, a date and a hydrant");
  if (!zone.hydrantIds.includes(hydrant.id)) return fail(res, 400, "This hydrant does not serve your zone");
  if (!hydrant.available) return fail(res, 409, "This hydrant is closed at the moment");
  if (b.type === "subsidised" && !user.subsidised) return fail(res, 403, "Your subsidy is not approved yet");

  const booking = {
    id: nextId("bookings"),
    customerId: user.id, customerName: user.name,
    zoneId: zone.id, zoneName: zone.name,
    hydrantId: hydrant.id, hydrantName: hydrant.name,
    type: b.type, size: Number(b.size), date: b.date, address: b.address,
    price: b.type === "subsidised" ? rate.subsidised : rate.commercial,
    status: b.type === "subsidised" ? "Pending Approval" : "Approved",
    tankerId: null, tankerNumber: null, driverId: null, driverName: null,
    failReason: null, createdAt: now(), updatedAt: now(),
  };
  db.get("bookings").push(booking).write();
  addHistory(booking.id, booking.status, user);
  res.status(201).json(booking);
});

// A status change: also keeps the tanker number and driver name on the booking
server.patch("/api/bookings/:id", (req, res) => {
  const booking = db.get("bookings").find({ id: req.params.id });
  if (!booking.value()) return fail(res, 404, "Booking not found");

  const changes = { ...req.body, updatedAt: now() };
  if (changes.tankerId) changes.tankerNumber = db.get("tankers").find({ id: String(changes.tankerId) }).value().number;
  if (changes.driverId) changes.driverName = db.get("users").find({ id: String(changes.driverId) }).value().name;
  booking.assign(changes).write();
  if (changes.status) addHistory(req.params.id, changes.status, req.user);
  res.json(booking.value());
});

// ---------- Subsidy: approving it marks the customer as subsidised ----------
server.patch("/api/subsidyApplications/:id", (req, res, next) => {
  const app = db.get("subsidyApplications").find({ id: req.params.id }).value();
  if (app && req.body.status === "Approved") {
    db.get("users").find({ id: app.customerId }).assign({ subsidised: true, monthlyLimit: 4 }).write();
  }
  next(); // json-server saves the new status
});

// ---------- Complaints: the booking becomes "Disputed"; resolving closes the complaint ----------
server.post("/api/disputes", (req, res, next) => {
  const booking = db.get("bookings").find({ id: String(req.body.bookingId) });
  if (!booking.value() || booking.value().status !== "Delivered") {
    return fail(res, 409, "Only a delivered booking can be disputed");
  }
  booking.assign({ status: "Disputed", updatedAt: now() }).write();
  addHistory(String(req.body.bookingId), "Disputed", req.user);
  req.body.zoneId = booking.value().zoneId;
  req.body.status = "Open";
  next();
});

server.patch("/api/disputes/:id", (req, res, next) => {
  req.body.status = "Resolved";
  next();
});

// ---------- Each person sees only their own part (like the Phase 2 backend) ----------
server.get(["/api/bookings", "/api/subsidyApplications", "/api/disputes"], (req, res, next) => {
  const user = req.user;
  if (user.role === "customer") req.query.customerId = user.id;
  if (user.role === "officer") req.query.zoneId = String(user.zoneId);
  if (user.role === "operator") req.query.hydrantId = String(user.hydrantId);
  if (user.role === "driver") req.query.driverId = user.id;
  next();
});

// ---------- New records get text ids; users never show their password ----------
server.post("/api/*", (req, res, next) => {
  const collection = req.path.split("/")[2];
  req.body.id = nextId(collection);
  if (req.user) {
    if (collection === "subsidyApplications" || collection === "disputes") {
      Object.assign(req.body, { customerId: req.user.id, customerName: req.user.name, createdAt: now() });
      if (collection === "subsidyApplications") Object.assign(req.body, { zoneId: String(req.user.zoneId), status: "Pending" });
    }
  }
  next();
});

router.render = (req, res) => {
  const data = res.locals.data;
  // Only the admin sees passwords (to tell a staff member who forgot theirs)
  if (req.path.startsWith("/users") && !(req.user && req.user.role === "admin")) {
    res.jsonp(Array.isArray(data) ? data.map(safeUser) : safeUser(data));
  } else {
    res.jsonp(data);
  }
};

// All other requests (lists, filters, sort, pages, add, edit, delete) are done by json-server
server.use("/api", router);

server.listen(PORT, () => {
  console.log("PaaniLink (Phase 1 mock API) is running: http://www.paanilink.localhost:" + PORT);
});
