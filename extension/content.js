// Auto Job Apply: fills the application form on this page from your profile, attaches your
// tailored resume and cover letter, and asks your app's AI for the rest. It never submits.

(() => {
  if (window.__ajaLoaded) return;
  window.__ajaLoaded = true;

  const isTop = window === window.top;

  // ---------------------------------------------------------------- messaging

  const send = (type, payload = {}) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res && res.error) return reject(new Error(res.error));
        resolve(res);
      });
    });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const norm = (t) => clean(t).toLowerCase().replace(/[^a-z0-9+ ]/g, "").trim();

  // ---------------------------------------------------------------- reading the form

  const SKIP_TYPES = new Set(["hidden", "password", "submit", "button", "image", "reset", "search"]);
  const TEXT_TYPES = new Set(["", "text", "email", "tel", "url", "number", "date", "month"]);
  const SKIP_NAMES = /captcha|recaptcha|honeypot|g-recaptcha|cf-turnstile|^h_|_gotcha/i;

  function isVisible(el) {
    if (!el || !el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
  }

  function textOf(node) {
    if (!node) return "";
    const copy = node.cloneNode(true);
    copy.querySelectorAll("input, select, textarea, button, script, style, svg, [aria-hidden='true']").forEach((n) => n.remove());
    return clean(copy.innerText || copy.textContent);
  }

  const FIELD_SELECTOR = "input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select";

  /**
   * Text placed just before a control, for forms that don't link labels to inputs.
   * Walks up from the control while its container holds only this one field, checking the
   * elements before it at each level (a label sitting outside the input's own wrapper).
   */
  function nearbyText(el) {
    let node = el;
    for (let depth = 0; depth < 6 && node && node !== el.ownerDocument.body; depth++) {
      for (let prev = node.previousElementSibling, i = 0; prev && i < 4; prev = prev.previousElementSibling, i++) {
        if (prev.matches(FIELD_SELECTOR) || prev.querySelector(FIELD_SELECTOR)) break; // that's another field
        const t = textOf(prev);
        if (t && t.length <= 300) return t;
      }
      const parent = node.parentElement;
      if (!parent || parent.querySelectorAll(FIELD_SELECTOR).length > 1) break;
      node = parent;
    }
    return "";
  }

  const humanize = (s) =>
    String(s || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_\-[\].]+/g, " ")
      .trim();

  function rawLabel(el) {
    const tries = [
      () => (el.labels && el.labels.length ? textOf(el.labels[0]) : ""),
      () => {
        const ids = el.getAttribute("aria-labelledby");
        return ids
          ? ids
              .split(/\s+/)
              .map((id) => textOf(el.ownerDocument.getElementById(id)))
              .join(" ")
          : "";
      },
      () => el.getAttribute("aria-label") || "",
      () => {
        const wrap = el.closest("label");
        return wrap ? textOf(wrap) : "";
      },
      () => nearbyText(el),
      () => {
        // Common ATS layouts: a question block with a label/heading inside it.
        const block = el.closest(
          ".field, .application-question, .form-group, .form-field, .question, li, [data-automation-id*='formField'], [class*='Field'], [class*='question']",
        );
        if (!block || block.querySelectorAll(FIELD_SELECTOR).length > 1) return "";
        const lab = block.querySelector("label, legend, .application-label, .text, h3, h4, [class*='label'], [class*='Label']");
        return lab && !lab.contains(el) ? textOf(lab) : "";
      },
      () => el.placeholder || "",
      () => el.getAttribute("title") || "",
      () => humanize(el.name || el.id || ""),
    ];
    for (const t of tries) {
      const v = clean(t());
      if (v) return v.slice(0, 400);
    }
    return "";
  }

  function groupQuestion(inputs) {
    const fs = inputs[0].closest("fieldset");
    if (fs) {
      const legend = fs.querySelector("legend");
      if (legend) return textOf(legend);
    }
    const group = inputs[0].closest("[role='radiogroup'], [role='group']");
    if (group) {
      const lb = group.getAttribute("aria-labelledby");
      if (lb) return textOf(document.getElementById(lb));
      if (group.getAttribute("aria-label")) return group.getAttribute("aria-label");
    }
    // Walk up until the container holds the whole group, then take its first label-like text.
    let node = inputs[0].parentElement;
    for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
      if (inputs.every((x) => node.contains(x))) {
        const lab = node.querySelector("label:not(:has(input)), legend, .application-label, h3, h4, p, [class*='label'], [class*='Label']");
        if (lab) return textOf(lab);
      }
    }
    return rawLabel(inputs[0]);
  }

  function isRequired(el, label) {
    return el.required || el.getAttribute("aria-required") === "true" || /\*/.test(label);
  }

  function optionLabel(input) {
    if (input.labels && input.labels.length) return textOf(input.labels[0]);
    const wrap = input.closest("label");
    if (wrap) return textOf(wrap);
    const next = input.nextElementSibling;
    return clean(next ? next.innerText : input.value);
  }

  /** Every fillable control on the page, as descriptors. */
  function collectFields(doc = document) {
    const fields = [];
    const seenGroups = new Set();
    let n = 0;
    const add = (f) => fields.push({ ...f, id: `f${n++}` });

    doc.querySelectorAll("input, textarea, select, [role='combobox'], button[aria-haspopup='listbox']").forEach((el) => {
      if (el.disabled || el.readOnly) return;
      const name = `${el.name || ""} ${el.id || ""}`;
      if (SKIP_NAMES.test(name)) return;

      if (el.tagName === "INPUT") {
        const type = (el.type || "").toLowerCase();
        if (SKIP_TYPES.has(type)) return;
        if (type === "file") {
          const zone = el.closest("[class*='drop'], [class*='Drop'], [class*='upload'], [class*='Upload'], [role='button'], label") || el.parentElement;
          // Upload boxes often say only "Upload file"; the question ("Resume *") sits just outside them.
          const label = clean(`${rawLabel(el)} ${zone && zone !== el ? `${textOf(zone)} ${nearbyText(zone)}` : ""}`).slice(0, 400);
          add({ el, kind: "file", label, options: [] });
          return;
        }
        if (type === "radio" || type === "checkbox") {
          const key = el.name ? `${type}:${el.name}` : null;
          if (key && seenGroups.has(key)) return;
          const members = key ? [...doc.querySelectorAll(`input[type='${type}'][name='${CSS.escape(el.name)}']`)] : [el];
          if (key) seenGroups.add(key);
          if (!members.some(isVisible) && !members.some((m) => m.closest("label") && isVisible(m.closest("label")))) return;
          const label = members.length > 1 ? groupQuestion(members) : type === "checkbox" ? optionLabel(el) || rawLabel(el) : rawLabel(el);
          add({
            el: members[0],
            members,
            kind: type,
            label,
            options: members.map(optionLabel),
            required: members.some((m) => m.required),
          });
          return;
        }
        if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list") {
          if (!isVisible(el) && !isVisible(el.parentElement)) return;
          add({ el, kind: "combobox", label: rawLabel(el), options: [] });
          return;
        }
        if (!TEXT_TYPES.has(type) || !isVisible(el)) return;
        const label = rawLabel(el);
        add({ el, kind: type === "" ? "text" : type, label, options: [], required: isRequired(el, label), maxLength: el.maxLength > 0 ? el.maxLength : null });
        return;
      }
      if (el.tagName === "TEXTAREA") {
        if (!isVisible(el)) return;
        const label = rawLabel(el);
        add({ el, kind: "textarea", label, options: [], required: isRequired(el, label), maxLength: el.maxLength > 0 ? el.maxLength : null });
        return;
      }
      if (el.tagName === "SELECT") {
        if (!isVisible(el) && !isVisible(el.parentElement)) return;
        const label = rawLabel(el);
        const options = [...el.options]
          .filter((o) => o.value !== "" && !/^(select|choose|please select|--)/i.test(clean(o.text)))
          .map((o) => clean(o.text));
        add({ el, kind: "select", label, options, required: isRequired(el, label) });
        return;
      }
      // Custom dropdowns (React Select, Workday buttons)
      if (!isVisible(el)) return;
      if (el.tagName === "INPUT") return;
      const label = rawLabel(el);
      add({ el, kind: "combobox", label, options: [], required: isRequired(el, label) });
    });
    return fields;
  }

  function isFilled(f) {
    const el = f.el;
    if (f.kind === "file") return el.files && el.files.length > 0;
    if (f.kind === "radio" || f.kind === "checkbox") return f.members.some((m) => m.checked);
    if (f.kind === "select") return el.selectedIndex > 0 && el.value !== "";
    if (f.kind === "combobox") {
      if (el.tagName === "BUTTON") return !/select|choose/i.test(clean(el.innerText));
      const shown = el.closest("[class*='container'], [class*='control']");
      return clean(el.value) !== "" || Boolean(shown && shown.querySelector("[class*='singleValue'], [class*='multi-value'], [class*='single-value']"));
    }
    return clean(el.value) !== "";
  }

  function hasApplicationForm(doc = document) {
    const fields = collectFields(doc);
    const files = fields.filter((f) => f.kind === "file").length;
    const contact = fields.filter((f) => /name|e-?mail|phone/i.test(f.label)).length;
    return files > 0 || contact >= 2;
  }

  // ---------------------------------------------------------------- writing values

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function bestMatch(candidates, wanted, getText = (x) => x) {
    const w = norm(wanted);
    if (!w) return null;
    return (
      candidates.find((c) => norm(getText(c)) === w) ||
      candidates.find((c) => {
        const t = norm(getText(c));
        return t && (t.startsWith(w) || w.startsWith(t));
      }) ||
      candidates.find((c) => {
        const t = norm(getText(c));
        return t && (t.includes(w) || w.includes(t));
      }) ||
      null
    );
  }

  function chooseSelect(el, wanted) {
    const opt = bestMatch([...el.options].filter((o) => o.value !== ""), wanted, (o) => o.text);
    if (!opt) return false;
    setNativeValue(el, opt.value);
    return true;
  }

  function clickOption(f, values) {
    let any = false;
    for (const v of values) {
      const m = bestMatch(f.members, v, optionLabel);
      if (m && !m.checked) {
        m.click();
        any = true;
      } else if (m) any = true;
    }
    return any;
  }

  function visibleOptions() {
    return [...document.querySelectorAll("[role='option'], [data-automation-id='promptOption']")].filter(isVisible);
  }

  async function chooseCombobox(el, wanted) {
    el.focus();
    el.click();
    await sleep(250);
    if (el.tagName === "INPUT") {
      setNativeValue(el, wanted);
      await sleep(500);
    }
    const opt = bestMatch(visibleOptions(), wanted, (o) => o.innerText);
    if (opt) {
      opt.scrollIntoView({ block: "nearest" });
      opt.click();
      await sleep(150);
      return true;
    }
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  }

  async function readComboOptions(el) {
    try {
      el.click();
      await sleep(300);
      const texts = visibleOptions()
        .map((o) => clean(o.innerText))
        .filter(Boolean)
        .slice(0, 60);
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      if (document.activeElement === el) el.blur();
      await sleep(120);
      return texts;
    } catch {
      return [];
    }
  }

  function attachFile(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fileUrl(upload) {
    const url = URL.createObjectURL(base64ToFile(upload.base64, upload.name));
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    return url;
  }

  function viewUpload(upload) {
    if (!window.open(fileUrl(upload), "_blank")) downloadUpload(upload);
  }

  function downloadUpload(upload) {
    const a = document.createElement("a");
    a.href = fileUrl(upload);
    a.download = upload.name;
    document.body.append(a);
    a.click();
    a.remove();
  }

  function base64ToFile(b64, name) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: "application/pdf" });
  }

  function mark(f, state) {
    const target =
      f.kind === "radio" || f.kind === "checkbox"
        ? f.el.closest("fieldset, [role='radiogroup'], [role='group'], .field, .application-question, li") || f.el.parentElement
        : f.kind === "file"
          ? f.el.closest(".field, .application-question, [class*='upload'], [class*='Upload'], li") || f.el.parentElement
          : f.el;
    if (!target) return;
    target.style.outline = `2px solid ${state === "filled" ? "#13803f" : "#e0a43a"}`;
    target.style.outlineOffset = "2px";
    target.style.borderRadius = target.style.borderRadius || "6px";
    target.dataset.ajaState = state;
  }

  // ---------------------------------------------------------------- answers from your profile (free)

  /**
   * Straight from your profile. Returns undefined when no rule applies (the AI may answer),
   * or "" when the field is recognised but your profile doesn't have it (you fill it in).
   */
  function ruleValue(f, ctx) {
    if (!["text", "email", "tel", "url", "number", "textarea"].includes(f.kind)) return undefined;
    const L = f.label.toLowerCase();
    const ac = (f.el.getAttribute("autocomplete") || "").toLowerCase();
    const p = ctx.profile;
    const per = p.personal;
    const names = clean(per.fullName).split(" ");
    const first = names[0] || "";
    const last = names.slice(1).join(" ");
    const edu = p.education[0] || {};
    const job = p.experience[0] || {};
    const or = (v) => v || "";

    if (ac === "given-name" || /\bfirst\s*name|given name|preferred (first )?name/.test(L)) return first;
    if (ac === "family-name" || /\blast\s*name|surname|family name/.test(L)) return last;
    if (ac === "name" || /^(full |legal |your )?name\b|full name|legal name/.test(L)) return or(per.fullName);
    if (ac === "email" || f.kind === "email" || /e-?mail/.test(L)) return or(per.email);
    if (ac.startsWith("tel") || f.kind === "tel" || /phone|mobile|cell/.test(L)) return or(per.phone);
    if (/linkedin/.test(L)) return or(per.linkedin);
    if (/github/.test(L)) return or(per.github);
    if (/portfolio|personal (web)?site|website|blog/.test(L)) return or(per.website || per.github);
    if (/^(city|suburb)|current location|where are you (located|based)|^location\b|^address/.test(L) && f.kind !== "textarea") return or(per.location);
    if (/cover letter/.test(L) && f.kind === "textarea") return ctx.coverText || undefined;
    if (/salary|compensation|remuneration|pay expectation/.test(L)) return or(p.salaryExpectation);
    if (/notice period|available to start|availability|when can you start|start date/.test(L) && f.kind !== "number") return or(p.availability);
    if (/universit|school|college|institution/.test(L) && f.kind !== "textarea") return or(edu.institution);
    if (/^degree|degree (name|title)|field of study|major|discipline/.test(L) && f.kind !== "textarea") return or(edu.degree);
    if (/current (company|employer)|most recent (company|employer)/.test(L)) return or(job.company);
    if (/current (job )?title|current (role|position)|most recent (title|role)/.test(L)) return or(job.title);
    return undefined;
  }

  function fileKind(f, fileFields) {
    const L = `${f.label} ${f.el.name || ""} ${f.el.id || ""} ${f.el.accept || ""}`.toLowerCase();
    if (/cover/.test(L)) return "cover";
    if (/resume|\bcv\b|curriculum|autofill/.test(L)) return "resume";
    if (/photo|image|avatar|picture|transcript|portfolio/.test(L)) return null;
    // Unlabelled uploads: the first one is almost always the resume.
    if (fileFields.indexOf(f) === 0 && !fileFields.some((x) => /resume|\bcv\b/i.test(x.label))) return "resume";
    return null;
  }

  // ---------------------------------------------------------------- the panel

  const state = {
    ctx: null,
    jobId: null,
    filling: false,
    filledOnce: false,
    review: [],
    panel: null,
    uploads: [], // files this panel attached: { kind, name, base64, tailored, company }
    uploadsJobId: undefined,
  };

  const PANEL_CSS = `
    :host { all: initial; }
    .wrap { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; width: 340px; max-width: calc(100vw - 36px);
      font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1b2130;
      background: #fff; border: 1px solid #e3e6ec; border-radius: 16px; box-shadow: 0 2px 4px rgba(27,33,48,.06), 0 18px 48px -16px rgba(27,33,48,.35); }
    .head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #eceef3; }
    .mark { width: 20px; height: 20px; border-radius: 6px; background: #5a4bd1; flex: none; display: grid; place-items: center; }
    .mark i { width: 9px; height: 7px; border: 2px solid #fff; border-radius: 2px; display: block; }
    .title { font-weight: 700; flex: 1; }
    .x { border: 0; background: none; cursor: pointer; color: #646c7d; font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 6px; }
    .x:hover { background: #eceef3; color: #1b2130; }
    .body { padding: 12px 14px 14px; display: grid; gap: 10px; max-height: 70vh; overflow: auto; }
    .job { background: #f5f6f9; border-radius: 10px; padding: 9px 11px; }
    .job b { display: block; }
    .muted { color: #646c7d; font-size: 12.5px; }
    .score { font-weight: 700; color: #13803f; }
    select { width: 100%; font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid #cbd0d9; border-radius: 8px; background: #fff; color: #1b2130; }
    button.btn { font: inherit; font-weight: 650; font-size: 13.5px; height: 36px; border-radius: 9px; border: 1px solid #cbd0d9; background: #fff; color: #1b2130; cursor: pointer; padding: 0 12px; width: 100%; }
    button.btn:hover { background: #f5f6f9; }
    button.primary { background: #5a4bd1; border-color: #5a4bd1; color: #fff; }
    button.primary:hover { background: #4636b5; }
    button:disabled { opacity: .5; cursor: default; }
    .row { display: flex; gap: 8px; }
    .msg { font-size: 13px; white-space: pre-wrap; }
    .err { color: #c4321f; }
    .ok { color: #13803f; }
    ul { margin: 0; padding-left: 18px; font-size: 13px; }
    li { cursor: pointer; margin: 2px 0; }
    li:hover { text-decoration: underline; }
    .legend { display: flex; gap: 12px; font-size: 12px; color: #646c7d; }
    .files { border: 1px solid #e3e6ec; border-radius: 10px; padding: 10px 11px; display: grid; gap: 9px; }
    .files-title { font-size: 12.5px; font-weight: 700; color: #4a5263; }
    .file { display: flex; gap: 10px; align-items: center; justify-content: space-between; }
    .file-info { min-width: 0; display: grid; }
    .file-info b { font-size: 13.5px; }
    .file-info .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-actions { display: flex; gap: 6px; flex: none; }
    button.mini { font: inherit; font-size: 12.5px; font-weight: 650; height: 28px; padding: 0 10px; border-radius: 7px; border: 1px solid #cbd0d9; background: #fff; color: #1b2130; cursor: pointer; }
    button.mini:hover { background: #f5f6f9; }
    .dot { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
  `;

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) node.append(c.nodeType ? c : document.createTextNode(String(c)));
    return node;
  }

  function ensurePanel() {
    if (state.panel) {
      state.panel.host.style.display = "";
      return state.panel;
    }
    const host = document.createElement("div");
    host.id = "auto-job-apply-panel";
    const root = host.attachShadow({ mode: "open" });
    root.append(el("style", {}, PANEL_CSS));
    const body = el("div", { class: "body" });
    const wrap = el(
      "div",
      { class: "wrap", role: "dialog", "aria-label": "Auto Job Apply" },
      el(
        "div",
        { class: "head" },
        el("span", { class: "mark" }, el("i")),
        el("span", { class: "title" }, "Auto Job Apply"),
        el("button", { class: "x", title: "Close", "aria-label": "Close", onclick: () => (host.style.display = "none") }, "×"),
      ),
      body,
    );
    root.append(wrap);
    document.documentElement.append(host);
    state.panel = { host, body };
    return state.panel;
  }

  function render(message, tone) {
    const { body } = ensurePanel();
    body.replaceChildren();
    const ctx = state.ctx;

    if (!ctx) {
      body.append(el("div", { class: `msg ${tone || ""}` }, message || "Loading…"));
      return;
    }

    // Which job is this?
    const current = ctx.candidates.find((j) => j.id === state.jobId) || (ctx.job && ctx.job.id === state.jobId ? ctx.job : null);
    const jobBox = el("div", { class: "job" });
    if (current) {
      jobBox.append(
        el("b", {}, current.title),
        el("span", { class: "muted" }, `${current.company || ""}${current.score != null ? " · " : ""}`),
        current.score != null ? el("span", { class: "score" }, `${current.score} match`) : null,
        el("div", { class: "muted" }, current.hasDocs ? "Tailored resume and cover letter ready." : "No tailored resume yet. Your plain resume will be used."),
      );
    } else {
      jobBox.append(el("b", {}, "Not linked to a job"), el("div", { class: "muted" }, "Your plain resume will be used. Pick the job below, or add this page."));
    }
    body.append(jobBox);

    const picker = el(
      "select",
      {
        "aria-label": "Which job is this application for?",
        onchange: async (e) => {
          const v = e.target.value;
          if (v === "add") return addThisJob();
          state.jobId = v ? Number(v) : null;
          render();
        },
      },
      el("option", { value: "" }, "No job (plain resume)"),
      ...ctx.candidates.map((j) =>
        el("option", { value: String(j.id), ...(j.id === state.jobId ? { selected: "" } : {}) }, `${j.title}${j.company ? ` at ${j.company}` : ""}${j.hasDocs ? " (tailored)" : ""}`),
      ),
      el("option", { value: "add" }, "Add this page as a new job…"),
    );
    if (current && !ctx.candidates.some((j) => j.id === current.id)) {
      picker.insertBefore(el("option", { value: String(current.id), selected: "" }, current.title), picker.options[1]);
    }
    body.append(picker);

    if (current && !current.hasDocs) {
      body.append(
        el(
          "button",
          { class: "btn", onclick: (e) => writeTailored(e.target) },
          "Write a tailored resume first (about $0.10)",
        ),
      );
    }

    body.append(
      el(
        "button",
        { class: "btn primary", disabled: state.filling ? "" : null, onclick: () => fillForm() },
        state.filling ? "Filling…" : state.filledOnce ? "Fill again (new or empty fields)" : "Fill this form",
      ),
    );

    if (message) body.append(el("div", { class: `msg ${tone || ""}` }, message));

    if (state.uploads.length) {
      body.append(
        el(
          "div",
          { class: "files" },
          el("div", { class: "files-title" }, "Uploaded to this form"),
          ...state.uploads.map((u) =>
            el(
              "div",
              { class: "file" },
              el(
                "div",
                { class: "file-info" },
                el(
                  "b",
                  {},
                  u.kind === "cover"
                    ? `Cover letter${u.company ? ` for ${u.company}` : ""}`
                    : u.tailored
                      ? `Resume tailored${u.company ? ` for ${u.company}` : ""}`
                      : "Resume (plain, not tailored)",
                ),
                el("span", { class: "muted", title: u.name }, u.name),
              ),
              el(
                "div",
                { class: "file-actions" },
                el("button", { class: "mini", title: "Open the uploaded file", onclick: () => viewUpload(u) }, "View"),
                el("button", { class: "mini", title: "Save a copy", onclick: () => downloadUpload(u) }, "Download"),
              ),
            ),
          ),
        ),
      );
    }

    if (state.review.length) {
      body.append(
        el("div", { class: "muted" }, "Check these before you submit:"),
        el(
          "ul",
          {},
          ...state.review.map((r) =>
            el("li", { onclick: () => r.el.scrollIntoView({ behavior: "smooth", block: "center" }) }, `${r.label.slice(0, 90)}${r.note ? ` (${r.note})` : ""}`),
          ),
        ),
      );
    }
    if (state.filledOnce) {
      body.append(
        el(
          "div",
          { class: "legend" },
          el("span", {}, el("span", { class: "dot", style: "background:#13803f" }), "Filled"),
          el("span", {}, el("span", { class: "dot", style: "background:#e0a43a" }), "Check this"),
        ),
      );
      if (state.jobId) {
        body.append(
          el(
            "button",
            {
              class: "btn",
              onclick: async (e) => {
                e.target.disabled = true;
                try {
                  await send("applied", { jobId: state.jobId });
                  render("Marked as applied in Auto Job Apply. Good luck!", "ok");
                } catch (err) {
                  render(err.message, "err");
                }
              },
            },
            "I've submitted it. Mark as applied",
          ),
        );
      }
    }
    body.append(el("div", { class: "muted" }, "Auto Job Apply never presses Submit. Review everything, then submit yourself."));
  }

  async function loadContext() {
    render("Loading your profile…");
    const ctx = await send("context", {
      url: location.href,
      title: document.title,
      text: (document.body.innerText || "").slice(0, 30000),
    });
    state.ctx = ctx;
    state.jobId = ctx.job ? ctx.job.id : null;
    if (ctx.job && !ctx.candidates.some((j) => j.id === ctx.job.id)) ctx.candidates.unshift(ctx.job);
    return ctx;
  }

  async function addThisJob() {
    const h1 = document.querySelector("h1");
    const title = prompt("Job title for this application:", clean(h1 ? h1.innerText : document.title).slice(0, 120));
    if (!title) return render();
    const og = document.querySelector("meta[property='og:site_name']");
    const company = prompt("Company:", og ? og.content : location.hostname.split(".").slice(-3, -2)[0] || "") || "";
    try {
      const { job } = await send("createJob", {
        url: location.href,
        title,
        company,
        description: (document.querySelector("main, article, [role='main']") || document.body).innerText.slice(0, 20000),
      });
      state.ctx.candidates.unshift(job);
      state.jobId = job.id;
      render("Added to your jobs list.", "ok");
    } catch (err) {
      render(err.message, "err");
    }
  }

  async function writeTailored(button) {
    button.disabled = true;
    button.textContent = "Writing your resume and cover letter… (30 to 90s)";
    try {
      const res = await send("generate", { jobId: state.jobId });
      const j = state.ctx.candidates.find((x) => x.id === state.jobId);
      if (j) j.hasDocs = true;
      if (state.ctx.job && state.ctx.job.id === state.jobId) state.ctx.job.hasDocs = true;
      render(`Tailored resume and cover letter written (AI cost $${Number(res.cost || 0).toFixed(3)}).`, "ok");
    } catch (err) {
      render(err.message, "err");
    }
  }

  // ---------------------------------------------------------------- filling

  async function fillForm() {
    if (state.filling) return;
    state.filling = true;
    state.review = [];
    try {
      if (!state.ctx) await loadContext();
      render("Filling in your details…");
      const ctx = state.ctx;
      const files = await send("files", { jobId: state.jobId || 0 });
      const helper = { profile: ctx.profile, coverText: files.coverText || "" };
      let filled = 0;

      // 1. Files first: some sites read the resume and pre-fill fields from it.
      let fields = collectFields();
      const fileFields = fields.filter((f) => f.kind === "file");
      let attached = [];
      const jobKey = state.jobId || 0;
      const switchedJob = state.uploadsJobId !== undefined && state.uploadsJobId !== jobKey;
      const company = (state.ctx.candidates.find((j) => j.id === state.jobId) || state.ctx.job || {}).company || "";
      for (const f of fileFields) {
        if (isFilled(f) && !switchedJob) continue;
        const which = fileKind(f, fileFields);
        const doc = which === "cover" ? files.cover : which === "resume" ? files.resume : null;
        if (!doc) continue;
        try {
          attachFile(f.el, base64ToFile(doc.base64, doc.name));
          mark(f, "filled");
          attached.push(which === "cover" ? "cover letter" : files.tailored ? "tailored resume" : "resume");
          state.uploads = state.uploads.filter((u) => u.kind !== which);
          state.uploads.push({ kind: which, name: doc.name, base64: doc.base64, tailored: which === "cover" || files.tailored, company });
          state.uploadsJobId = jobKey;
          filled++;
        } catch {
          state.review.push({ el: f.el, label: f.label || "File upload", note: "attach it yourself" });
          mark(f, "review");
        }
      }
      if (attached.length) await sleep(1500);

      // 2. Straight from your profile (free).
      fields = collectFields();
      const flagged = new Set();
      const typed = [];
      for (const f of fields) {
        if (f.kind === "file" || isFilled(f)) continue;
        const v = ruleValue(f, helper);
        if (v === undefined) continue;
        if (v) {
          setNativeValue(f.el, v);
          mark(f, "filled");
          typed.push(f);
          filled++;
        } else {
          flagged.add(f.el);
          mark(f, "review");
          state.review.push({ el: f.el, label: f.label || "Field", note: "not in your profile" });
        }
      }

      // 3. Everything else: ask your app's AI (counts against your "Application answers" limit).
      fields = collectFields().filter((f) => f.kind !== "file" && !isFilled(f) && !flagged.has(f.el));
      let aiCost = 0;
      if (fields.length) {
        render(`Filled ${filled} fields from your profile. Working out the other ${fields.length}…`);
        for (const f of fields) if (f.kind === "combobox") f.options = await readComboOptions(f.el);
        const res = await send("fill", {
          jobId: state.jobId,
          page: { url: location.href, title: document.title },
          fields: fields.map((f) => ({ id: f.id, label: f.label, kind: f.kind, options: f.options, required: Boolean(f.required), maxLength: f.maxLength || null })),
        });
        aiCost = Number(res.cost || 0);
        const byId = new Map(fields.map((f) => [f.id, f]));
        for (const a of res.fields || []) {
          const f = byId.get(a.id);
          if (!f) continue;
          const values = (a.values || []).filter((v) => clean(v));
          let ok = false;
          if (values.length) {
            if (f.kind === "select") ok = chooseSelect(f.el, values[0]);
            else if (f.kind === "radio" || f.kind === "checkbox") ok = clickOption(f, values);
            else if (f.kind === "combobox") ok = await chooseCombobox(f.el, values[0]);
            else if (f.kind === "date") {
              if (/^\d{4}-\d{2}-\d{2}$/.test(values[0])) {
                setNativeValue(f.el, values[0]);
                ok = true;
              }
            } else {
              const text = values.join(", ");
              setNativeValue(f.el, f.maxLength ? text.slice(0, f.maxLength) : text);
              ok = true;
            }
          }
          if (ok) {
            filled++;
            if (f.kind !== "radio" && f.kind !== "checkbox") typed.push(f);
          }
          if (!ok || a.needs_review) {
            mark(f, "review");
            state.review.push({ el: f.el, label: f.label || "Question", note: a.note || (ok ? "" : "needs your answer") });
          } else mark(f, "filled");
        }
      }

      // Some sites (location pickers, autocompletes) clear typed text unless you pick from their list.
      await sleep(700);
      for (const f of typed) {
        if (!f.el.isConnected || isFilled(f) || state.review.some((r) => r.el === f.el)) continue;
        filled--;
        mark(f, "review");
        state.review.push({ el: f.el, label: f.label || "Field", note: "the site cleared it; type it and pick from its list" });
      }

      // Required fields still empty
      for (const f of collectFields()) {
        if (f.kind !== "file" && f.required && !isFilled(f) && !state.review.some((r) => r.el === f.el)) {
          mark(f, "review");
          state.review.push({ el: f.el, label: f.label || "Required field", note: "required" });
        }
      }

      state.filledOnce = true;
      const parts = [`Filled ${filled} field${filled === 1 ? "" : "s"}.`];
      if (attached.length) parts.push(`Attached your ${[...new Set(attached)].join(" and ")}.`);
      if (aiCost) parts.push(`AI cost $${aiCost.toFixed(3)}.`);
      if (!state.review.length) parts.push("Nothing flagged. Read it over, then submit.");
      state.filling = false;
      render(parts.join(" "), "ok");
    } catch (err) {
      state.filling = false;
      render(err.message, "err");
    }
  }

  // ---------------------------------------------------------------- starting up

  /**
   * mode "manual": you asked from the popup, so fill straight away.
   * mode "auto": opened by itself on a job site; fills only when the page is linked to one of your jobs,
   * so just browsing job pages never spends money.
   */
  async function open(mode) {
    ensurePanel();
    try {
      const status = await send("status");
      if (!status.connected) {
        render("Not connected. Click the Auto Job Apply icon in Chrome's toolbar and log in with your app details.", "err");
        return;
      }
      await loadContext();
      if (!hasApplicationForm()) {
        render("No application form on this page yet. Open the site's application form, then click Fill this form.");
        return;
      }
      render();
      if (mode === "manual" || (mode === "auto" && state.ctx.job)) await fillForm();
    } catch (err) {
      render(err.message, "err");
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "aja-open") {
      if (isTop || hasApplicationForm()) open(msg.autostart ? "manual" : "panel");
      sendResponse({ ok: true });
    }
  });

  // On known job-application sites, open (and optionally fill) by itself once a form appears.
  async function autoStart() {
    let status;
    try {
      status = await send("status");
    } catch {
      return;
    }
    if (!status.connected) return;
    let started = false;
    const check = () => {
      if (started || !hasApplicationForm()) return;
      started = true;
      observer.disconnect();
      open(status.autoFill ? "auto" : "panel");
    };
    const observer = new MutationObserver(() => {
      clearTimeout(check.t);
      check.t = setTimeout(check, 900);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    check();
    setTimeout(() => observer.disconnect(), 120000);
  }

  autoStart();
})();
