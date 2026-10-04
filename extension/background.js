// Auto Job Apply extension: talks to your Auto Job Apply app on behalf of the popup and the page.
// Stores only the app URL and a 90-day login token, never your password.

const KEYS = ["appUrl", "token", "name", "autoFill"];

async function config() {
  const stored = await chrome.storage.local.get(KEYS);
  return { appUrl: "", token: "", name: "", autoFill: true, ...stored };
}

function cleanUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

async function call(path, { method = "GET", body } = {}) {
  const { appUrl, token } = await config();
  if (!appUrl || !token) throw new Error("Not connected. Click the Auto Job Apply icon in Chrome's toolbar and log in.");
  let res;
  try {
    res = await fetch(`${appUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Couldn't reach ${appUrl}. Check your internet connection and the app address.`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) await chrome.storage.local.remove("token");
  if (!res.ok) throw new Error(data.error || `The app returned an error (HTTP ${res.status}).`);
  return data;
}

const handlers = {
  async login({ appUrl, username, password }) {
    const url = cleanUrl(appUrl);
    if (!/^https?:\/\//.test(url)) throw new Error("Enter the full app address, starting with https://");
    let res;
    try {
      res = await fetch(`${url}/api/ext/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      throw new Error(`Couldn't reach ${url}. Check the address.`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Login failed (HTTP ${res.status}).`);
    await chrome.storage.local.set({ appUrl: url, token: data.token, name: data.name || "" });
    return { ok: true, name: data.name };
  },

  async logout() {
    await chrome.storage.local.remove(["token", "name"]);
    return { ok: true };
  },

  async status() {
    const c = await config();
    return { connected: Boolean(c.appUrl && c.token), appUrl: c.appUrl, name: c.name, autoFill: c.autoFill !== false };
  },

  async setAutoFill({ value }) {
    await chrome.storage.local.set({ autoFill: Boolean(value) });
    return { ok: true };
  },

  context: ({ url, title, text }) => call("/api/ext/context", { method: "POST", body: { url, title, text } }),
  files: ({ jobId }) => call(`/api/ext/jobs/${Number(jobId) || 0}/files`),
  createJob: (job) => call("/api/ext/jobs", { method: "POST", body: job }),
  generate: ({ jobId }) => call(`/api/ext/jobs/${Number(jobId)}/generate`, { method: "POST" }),
  fill: ({ jobId, page, fields }) => call("/api/ext/fill", { method: "POST", body: { jobId, page, fields } }),
  applied: ({ jobId }) => call(`/api/ext/jobs/${Number(jobId)}/applied`, { method: "POST" }),

  /** "Fill this page" from the popup, for sites the extension doesn't open on automatically. */
  async fillTab({ tabId }) {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] });
    try {
      await chrome.tabs.sendMessage(tabId, { type: "aja-open", autostart: true });
    } catch {
      // A frame without a listener is fine; the frame holding the form answers.
    }
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  Promise.resolve(handler(msg))
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ error: err?.message || String(err) }));
  return true; // async response
});
