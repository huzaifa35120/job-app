const $ = (id) => document.getElementById(id);

function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (res && res.error) return reject(new Error(res.error));
      resolve(res);
    });
  });
}

function say(el, text, tone) {
  el.textContent = text || "";
  el.className = `msg ${tone || ""}`;
}

async function show() {
  const status = await send("status");
  $("login").hidden = status.connected;
  $("connected").hidden = !status.connected;
  if (status.connected) {
    $("who").textContent = status.name || "you";
    $("where").textContent = status.appUrl.replace(/^https?:\/\//, "");
    $("openApp").href = status.appUrl;
    $("autoFill").checked = status.autoFill;
  } else if (status.appUrl) {
    $("appUrl").value = status.appUrl;
  }
}

$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  say($("loginMsg"), "Connecting…");
  try {
    await send("login", { appUrl: $("appUrl").value, username: $("username").value, password: $("password").value });
    $("password").value = "";
    await show();
  } catch (err) {
    say($("loginMsg"), err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

$("fill").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) return say($("msg"), "Open a job application page first.", "err");
  try {
    await send("fillTab", { tabId: tab.id });
    window.close();
  } catch (err) {
    say($("msg"), `Couldn't fill this page: ${err.message}`, "err");
  }
});

$("autoFill").addEventListener("change", (e) => send("setAutoFill", { value: e.target.checked }));

$("logout").addEventListener("click", async () => {
  await send("logout");
  await show();
});

show().catch((err) => say($("loginMsg"), err.message, "err"));
