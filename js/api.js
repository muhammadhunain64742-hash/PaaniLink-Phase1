// api.js - All communication with the server goes through this file.
// The server answers under /api on the same address as the website.
// Phase 1: a mock API (json-server, mock-server.js). Phase 2: the real backend (Express + SQLite).
// This file is the same in both phases, so the website does not change.
// Example: on http://www.paanilink.localhost the bookings are at http://www.paanilink.localhost/api/bookings

const BASE_URL = window.location.origin + "/api";

// Sends one request to the server and returns the JSON answer.
// path   -> e.g. "/bookings?status=Approved"
// method -> "GET", "POST", "PATCH" or "DELETE"
// data   -> the object to send (only for POST and PATCH)
async function sendRequest(path, method, data) {
  const options = {
    method: method,
    headers: { "Content-Type": "application/json" },
  };

  // After login, send the token so the server knows who we are
  const token = localStorage.getItem("token");
  if (token) {
    options.headers.Authorization = "Bearer " + token;
  }

  if (data !== undefined && data !== null) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(BASE_URL + path, options);
  const body = await response.json();

  // 401 = not logged in or the session expired: go back to the login page
  if (response.status === 401 && !path.startsWith("/auth/")) {
    localStorage.clear();
    window.location.href = "login.html";
  }

  // The server explains every refusal in body.error (e.g. "Hydrant quota full")
  if (!response.ok) {
    throw new Error(body.error || "Request failed with status " + response.status);
  }

  return { body: body, total: Number(response.headers.get("X-Total-Count")) };
}

// Short helper functions used by every page
const api = {
  get: async (path) => (await sendRequest(path, "GET")).body,                // read data
  post: async (path, data) => (await sendRequest(path, "POST", data)).body,  // create a record
  patch: async (path, data) => (await sendRequest(path, "PATCH", data)).body,// update a record
  del: async (path) => (await sendRequest(path, "DELETE")).body,             // delete a record

  // For tables with pages: returns the rows AND the total number of rows
  getPage: async (path) => {
    const result = await sendRequest(path, "GET");
    return { rows: result.body, total: result.total };
  },
};
