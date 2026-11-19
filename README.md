# PaaniLink – Water Tanker Booking and Dispatch System
## Phase 1: Frontend with a mock API

The website is plain **HTML, CSS and JavaScript**. Every page talks to the server
with `fetch()` through one file, `js/api.js`, at the address `/api/...`.

In Phase 1 the server is a **mock API**: `json-server` keeps the data in `db.json`,
and `mock-server.js` adds the few things json-server cannot do alone
(login, register, booking price and status, booking history, report).
In Phase 2 the same website runs on the real backend (Express + SQLite).
**The website files are the same in both phases** – only the server changes.

### How to run
1. Install **Node.js** (LTS) from https://nodejs.org (once).
2. Download this project: on GitHub press **Code → Download ZIP** and extract it,
   or run `git clone <repository link>`.
3. Open the project folder in **Visual Studio Code**, then open a terminal (**Terminal → New Terminal**).
4. Run `npm install` (once – it downloads json-server into `node_modules`).
5. Run `npm start`.
6. Open **http://localhost:3000** in the browser.

### Sample accounts (data in db.json)
Login with the **phone number** and **password**.

| Role | Name | Phone | Password |
|---|---|---|---|
| Administrator | Hunain | 03000000001 | admin123 |
| Zone Officer (North Nazimabad) | Imran Qureshi | 03124587631 | 1234 |
| Zone Officer (Gulshan-e-Iqbal) | Saima Baig | 03332190458 | 1234 |
| Hydrant Operator (Sakhi Hassan) | Asif Mehmood | 03017745290 | 1234 |
| Hydrant Operator (NIPA) | Tariq Javed | 03458812036 | 1234 |
| Driver (Sakhi Hassan) | Rashid Khan | 03216634907 | 1234 |
| Driver (NIPA) | Naveed Akhtar | 03007219584 | 1234 |
| Customer (subsidised) | Ayesha Siddiqui | 03152238764 | 1234 |
| Customer | Bilal Ahmed | 03349061275 | 1234 |
| Customer | Usman Farooq | 03224410937 | 1234 |

New customers can also register on the website.

### Folders and files
| File | What it does |
|---|---|
| `index.html` | Landing page (with a simple CSS animation) |
| `login.html`, `register.html` | Login and customer sign-up |
| `admin.html`, `officer.html`, `operator.html`, `driver.html`, `customer.html` | One page per role |
| `css/style.css` | All the design. Colours are variables at the top (`:root`) |
| `css/home.css` | Landing page design and animation |
| `js/api.js` | The only file that talks to the server |
| `js/common.js` | Shared helpers: login check, form validation, tabs, show/hide password |
| `js/admin.js`, `js/officer.js`, ... | The code of each page |
| `db.json` | The mock database |
| `mock-server.js` | The mock API |

See `API_CONTRACT.md` for every request the website sends.
