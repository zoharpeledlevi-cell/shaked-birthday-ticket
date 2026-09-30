/* =========================================================
   הלוגיקה של האתר. כל הטקסטים מגיעים מ-content.js
   ========================================================= */
(function () {
  "use strict";

  const C = CONTENT;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // סדר שלבי הבחירה (בשביל "שלב X מתוך Y")
  const STEPS = ["activity", "food", "date", "time"];

  const state = {
    activity: null, // אינדקס של הכרטיס שנבחר
    food: null,
    day: null, // מספר היום בחודש
    part: null, // id של חלק ביום
  };

  let currentScreen = null;
  let cardLock = false;

  /* ---------- כלים ---------- */

  function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
  }

  function fire(opts) {
    if (typeof window.confetti === "function") window.confetti(opts);
  }

  const CONFETTI_COLORS = ["#ff5fa8", "#e0249a", "#ffc9e4", "#ffffff", "#b98cff", "#ffd1f0"];

  function emojiShapes() {
    if (!window.confetti || typeof confetti.shapeFromText !== "function") return null;
    try {
      return (C.confettiEmojis || []).map((t) => confetti.shapeFromText({ text: t, scalar: 2 }));
    } catch (e) {
      return null;
    }
  }

  function smallConfetti(x, y) {
    fire({ particleCount: 40, spread: 70, startVelocity: 28, origin: { x, y }, colors: CONFETTI_COLORS, scalar: 0.8 });
  }

  function openingConfetti() {
    fire({ particleCount: 90, spread: 100, origin: { y: 0.65 }, colors: CONFETTI_COLORS });
  }

  function bigConfetti() {
    const end = Date.now() + 1800;
    const shapes = emojiShapes();
    fire({ particleCount: 180, spread: 140, startVelocity: 50, origin: { y: 0.6 }, colors: CONFETTI_COLORS });
    if (shapes) {
      fire({ particleCount: 30, spread: 120, startVelocity: 40, origin: { y: 0.6 }, shapes, scalar: 2 });
    }
    (function frame() {
      fire({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: CONFETTI_COLORS });
      fire({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: CONFETTI_COLORS });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  function elementCenter(el) {
    const r = el.getBoundingClientRect();
    return {
      x: (r.left + r.width / 2) / window.innerWidth,
      y: (r.top + r.height / 2) / window.innerHeight,
    };
  }

  /* ---------- טקסטים מ-content.js ---------- */

  function applyTexts() {
    document.title = C.pageTitle;
    $$("[data-t]").forEach((el) => {
      const value = getPath(C, el.dataset.t);
      if (value != null) el.textContent = value;
    });
  }

  /* ---------- רקע מרחף ---------- */

  function buildFloaters() {
    const box = $("#floaters");
    const list = C.floatingEmojis || [];
    const count = window.innerWidth < 600 ? 12 : 18;
    for (let i = 0; i < count && list.length; i++) {
      const s = document.createElement("span");
      s.className = "floater";
      s.textContent = list[i % list.length];
      s.style.left = Math.random() * 92 + "%";
      s.style.fontSize = 18 + Math.random() * 26 + "px";
      s.style.animationDuration = 12 + Math.random() * 14 + "s";
      s.style.animationDelay = -Math.random() * 26 + "s";
      box.appendChild(s);
    }
  }

  /* ---------- ניווט בין מסכים ---------- */

  function show(name) {
    if (currentScreen === name) return;
    $$(".screen").forEach((s) => s.classList.remove("active"));
    const el = $("#screen-" + name);
    void el.offsetWidth; // מאפשר לאנימציית הכניסה לרוץ מחדש
    el.classList.add("active");
    currentScreen = name;
    window.scrollTo(0, 0);

    if (name !== "question") parkNoButton();
    if (name === "activity" || name === "food") renderCards(name);
    if (name === "date") renderCalendar();
    if (name === "time") renderParts();
    if (name === "summary") renderSummary();
  }

  function setupStepHeaders() {
    STEPS.forEach((step, i) => {
      const screen = $("#screen-" + step);
      // פס התקדמות מלבבות: מלאים עד השלב הנוכחי, ריקים אחריו
      const progress = $(".progress", screen);
      progress.setAttribute("aria-label", fill(C.common.stepCounter, { current: i + 1, total: STEPS.length }));
      STEPS.forEach((_, j) => {
        const heart = document.createElement("span");
        heart.textContent = j <= i ? C.common.progressDone : C.common.progressTodo;
        if (j === i) heart.className = "current";
        progress.appendChild(heart);
      });
      $(".btn-back", screen).addEventListener("click", () => {
        show(i === 0 ? "yay" : STEPS[i - 1]);
      });
    });
  }

  /* ---------- כפתור ה"לא" הבורח ---------- */

  const noBtn = $("#btn-no");
  const yesBtn = $("#btn-yes");
  const yesNoBox = $("#yes-no");
  let noIndex = 0;
  let lastNoPress = 0; // מתי נלחץ ה"לא" בפעם האחרונה
  let lastNoTouch = 0; // מתי נגעו ב"לא" באצבע בפעם האחרונה

  function resetNoButton() {
    noIndex = 0;
    noBtn.textContent = C.question.noButtons[0] || "";
    noBtn.className = "btn btn-no";
    noBtn.style.left = "";
    noBtn.style.top = "";
    noBtn.style.display = "";
    noBtn.style.setProperty("--s", 1);
    yesBtn.style.setProperty("--ys", 1);
    if (noBtn.parentNode !== yesNoBox) yesNoBox.appendChild(noBtn);
  }

  // כשיוצאים ממסך השאלה – הכפתור (אם ברח) נעלם
  function parkNoButton() {
    if (noBtn.classList.contains("running")) noBtn.style.display = "none";
  }

  function viewport() {
    const vv = window.visualViewport;
    return {
      w: Math.min(document.documentElement.clientWidth || window.innerWidth, window.innerWidth),
      h: vv ? Math.min(vv.height, window.innerHeight) : window.innerHeight,
    };
  }

  function overlaps(a, b, pad) {
    return !(
      a.x + a.w + pad < b.left ||
      a.x - pad > b.right ||
      a.y + a.h + pad < b.top ||
      a.y - pad > b.bottom
    );
  }

  // מחזיר מיקום אקראי שבתוך המסך ולא על כפתור ה"כן"
  function randomNoPosition() {
    const margin = 10;
    const { w, h } = viewport();
    const bw = noBtn.offsetWidth;
    const bh = noBtn.offsetHeight;
    const maxX = Math.max(margin, w - bw - margin);
    const maxY = Math.max(margin, h - bh - margin);
    const yes = yesBtn.getBoundingClientRect();
    const cur = noBtn.getBoundingClientRect();

    let fallback = null;
    for (let i = 0; i < 80; i++) {
      const p = {
        x: margin + Math.random() * (maxX - margin),
        y: margin + Math.random() * (maxY - margin),
        w: bw,
        h: bh,
      };
      if (overlaps(p, yes, 16)) continue;
      fallback = fallback || p;
      const dist = Math.hypot(p.x - cur.left, p.y - cur.top);
      if (dist > Math.min(w, h) * 0.3) return p;
    }
    if (fallback) return fallback;

    // אין מקום פנוי אקראי – הפינה הרחוקה ביותר מה"כן"
    const corners = [
      { x: margin, y: margin },
      { x: maxX, y: margin },
      { x: margin, y: maxY },
      { x: maxX, y: maxY },
    ];
    const yc = { x: (yes.left + yes.right) / 2, y: (yes.top + yes.bottom) / 2 };
    corners.sort((a, b) => Math.hypot(b.x - yc.x, b.y - yc.y) - Math.hypot(a.x - yc.x, a.y - yc.y));
    return corners[0];
  }

  function placeNo(p) {
    noBtn.style.left = Math.round(p.x) + "px";
    noBtn.style.top = Math.round(p.y) + "px";
  }

  // מוודא שהכפתור נשאר בתוך המסך (למשל אחרי סיבוב הטלפון)
  function clampNo() {
    if (!noBtn.classList.contains("running") || noBtn.style.display === "none") return;
    const margin = 10;
    const { w, h } = viewport();
    const x = Math.min(Math.max(margin, noBtn.offsetLeft), Math.max(margin, w - noBtn.offsetWidth - margin));
    const y = Math.min(Math.max(margin, noBtn.offsetTop), Math.max(margin, h - noBtn.offsetHeight - margin));
    const yes = yesBtn.getBoundingClientRect();
    if (overlaps({ x, y, w: noBtn.offsetWidth, h: noBtn.offsetHeight }, yes, 8)) {
      placeNo(randomNoPosition());
    } else {
      placeNo({ x, y });
    }
  }

  function onNoPress(e) {
    e.preventDefault();
    if (noBtn.classList.contains("vanish")) return;
    const list = C.question.noButtons;
    noIndex++;

    // אחרי הטקסט האחרון – נעלם
    if (noIndex >= list.length) {
      growYes();
      noBtn.classList.add("vanish");
      setTimeout(() => {
        noBtn.style.display = "none";
      }, 700);
      return;
    }

    // בפעם הראשונה: מעבירים את הכפתור לשכבה חופשית מעל המסך, באותו מקום שבו היה
    if (!noBtn.classList.contains("running")) {
      const r = noBtn.getBoundingClientRect();
      document.body.appendChild(noBtn);
      noBtn.classList.add("running");
      placeNo({ x: r.left, y: r.top });
      void noBtn.offsetWidth;
    }

    noBtn.textContent = list[noIndex];
    noBtn.style.setProperty("--s", Math.max(0.55, 1 - noIndex * 0.07));
    noBtn.classList.remove("shake");
    yesBtn.classList.remove("grow");
    yesBtn.style.setProperty("--ys", yesScale());
    // המיקום מחושב לפי הגודל הסופי של ה"כן", לפני אנימציית הקפיצה שלו
    placeNo(randomNoPosition());
    void noBtn.offsetWidth;
    noBtn.classList.add("shake");
    yesBtn.classList.add("grow");
  }

  // כפתור ה"כן" גדל קצת בכל פעם
  function yesScale() {
    return Math.min(1 + noIndex * 0.12, 1.9);
  }

  function growYes() {
    yesBtn.classList.remove("grow");
    yesBtn.style.setProperty("--ys", yesScale());
    void yesBtn.offsetWidth;
    yesBtn.classList.add("grow");
  }

  function setupQuestion() {
    resetNoButton();
    // בטלפון: touchstart עם preventDefault מבטל את ה"קליק" שהטלפון שולח אחרי הנגיעה.
    // בלי זה, הקליק נוחת על מה שנמצא מתחת לאצבע אחרי שה"לא" ברח – כלומר על ה"כן".
    noBtn.addEventListener(
      "touchstart",
      (e) => {
        lastNoPress = lastNoTouch = Date.now();
        onNoPress(e);
      },
      { passive: false }
    );
    // במחשב: עכבר (מגע כבר טופל למעלה, אז מתעלמים מאירועי עכבר שהטלפון מייצר אחרי נגיעה)
    const mouseDown = (e) => {
      if (e.pointerType === "touch" || Date.now() - lastNoTouch < 800) return;
      lastNoPress = Date.now();
      onNoPress(e);
    };
    noBtn.addEventListener(window.PointerEvent ? "pointerdown" : "mousedown", mouseDown);
    noBtn.addEventListener("click", (e) => e.preventDefault());
    noBtn.addEventListener("contextmenu", (e) => e.preventDefault());

    yesBtn.addEventListener("click", () => {
      // הגנה כפולה: "כן" לא מגיב ממש רגע אחרי נגיעה ב"לא"
      if (Date.now() - lastNoPress < 600) return;
      bigConfetti();
      show("yay");
    });

    window.addEventListener("resize", clampNo);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", clampNo);
  }

  /* ---------- כרטיסים מתהפכים ---------- */

  function gridColumns(n) {
    if (n <= 3) return n;
    if (n === 4) return 2;
    return 3;
  }

  function renderCards(step) {
    const box = $('[data-cards="' + step + '"]');
    const options = C[step].options;
    box.innerHTML = "";
    box.style.setProperty("--cols", gridColumns(options.length));
    box.classList.toggle("has-choice", state[step] != null);

    options.forEach((opt, i) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.style.animationDelay = 0.25 + i * 0.07 + "s";

      const inner = document.createElement("div");
      inner.className = "card-inner";

      const front = document.createElement("div");
      front.className = "face face-front";
      const sym = document.createElement("span");
      sym.className = "front-symbol";
      sym.textContent = C.cardFront.symbol;
      const d1 = document.createElement("span");
      d1.className = "front-deco d1";
      d1.textContent = C.cardFront.decoration;
      const d2 = d1.cloneNode(true);
      d2.className = "front-deco d2";
      front.append(sym, d1, d2);

      const back = document.createElement("div");
      back.className = "face face-back";
      const em = document.createElement("span");
      em.className = "back-emoji";
      em.textContent = opt.emoji;
      const nm = document.createElement("span");
      nm.className = "back-name";
      nm.textContent = opt.name;
      back.append(em, nm);

      inner.append(front, back);
      card.appendChild(inner);

      // אם כבר נבחר כרטיס (חזרנו אחורה) – מציגים אותו הפוך ומודגש
      if (state[step] === i) card.classList.add("flipped", "chosen");

      card.addEventListener("click", () => chooseCard(step, i, card, box));
      box.appendChild(card);
    });
  }

  function chooseCard(step, index, card, box) {
    if (cardLock) return;
    cardLock = true;

    const next = STEPS[STEPS.indexOf(step) + 1];

    // לחיצה על הכרטיס שכבר נבחר – ממשיכים
    if (state[step] === index && card.classList.contains("chosen")) {
      setTimeout(() => {
        cardLock = false;
        show(next);
      }, 250);
      return;
    }

    $$(".card", box).forEach((c) => {
      if (c !== card) c.classList.remove("flipped", "chosen", "peek");
    });
    box.classList.remove("has-choice");
    card.classList.add("flipped");
    state[step] = index;

    setTimeout(() => {
      card.classList.add("chosen");
      box.classList.add("has-choice");
      const c = elementCenter(card);
      smallConfetti(c.x, c.y);
    }, 650);

    // שאר הקלפים מתהפכים אחד אחרי השני – "מה היה מאחורי השאר"
    $$(".card", box)
      .filter((c) => c !== card)
      .forEach((c, k) => {
        setTimeout(() => {
          if (currentScreen === step) c.classList.add("peek");
        }, 1100 + k * 120);
      });

    setTimeout(() => {
      cardLock = false;
      if (currentScreen === step) show(next);
    }, 3300);
  }

  /* ---------- לוח שנה ---------- */

  function renderCalendar() {
    const { year, month } = C.date;
    const m = month - 1;
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const firstWeekday = new Date(year, m, 1).getDay(); // 0 = ראשון

    $("#cal-title").textContent = fill(C.date.calendarTitle, { month: C.date.monthName, year });

    const head = $("#cal-head");
    head.innerHTML = "";
    C.date.weekdayHeaders.forEach((w) => {
      const d = document.createElement("div");
      d.className = "cal-head";
      d.textContent = w;
      head.appendChild(d);
    });

    const grid = $("#cal-days");
    grid.innerHTML = "";
    for (let i = 0; i < firstWeekday; i++) grid.appendChild(document.createElement("div"));

    for (let day = 1; day <= daysInMonth; day++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "day";
      b.textContent = day;
      if (new Date(year, m, day).getDay() === 6) b.classList.add("sat");
      if (state.day === day) b.classList.add("selected");
      b.addEventListener("click", () => {
        $$(".day.selected", grid).forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        state.day = day;
        // אם חלק היום שנבחר קודם חסום בתאריך החדש – מבטלים אותו
        if (state.part && blockMessage(state.part, day)) state.part = null;
        $("#btn-date-next").disabled = false;
      });
      grid.appendChild(b);
    }

    $("#btn-date-next").disabled = state.day == null;
  }

  /* ---------- חלק ביום + חוקי חסימה ---------- */

  function parseDate(s) {
    const [y, mo, d] = s.split("-").map(Number);
    return new Date(y, mo - 1, d);
  }

  // מחזיר את הודעת החסימה אם האפשרות חסומה ביום הזה, אחרת null
  function blockMessage(optionId, day) {
    const date = new Date(C.date.year, C.date.month - 1, day);
    for (const rule of C.blockRules || []) {
      if (rule.option !== optionId) continue;
      const inRange = date >= parseDate(rule.from) && date <= parseDate(rule.to);
      const excepted = (rule.exceptWeekdays || []).includes(date.getDay());
      if (inRange && !excepted) return rule.message;
    }
    return null;
  }

  function renderParts() {
    const box = $("#parts");
    box.innerHTML = "";
    C.timeOfDay.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "part";
      b.style.animationDelay = 0.25 + i * 0.08 + "s";

      const em = document.createElement("span");
      em.className = "part-emoji";
      em.textContent = opt.emoji;
      const texts = document.createElement("span");
      texts.className = "part-texts";
      const nm = document.createElement("span");
      nm.className = "part-name";
      nm.textContent = opt.name;
      texts.appendChild(nm);

      const blocked = blockMessage(opt.id, state.day);
      if (blocked) {
        b.classList.add("blocked");
        b.disabled = true;
        const note = document.createElement("span");
        note.className = "part-note";
        note.textContent = blocked;
        texts.appendChild(note);
      }
      b.append(em, texts);

      if (state.part === opt.id) b.classList.add("selected");
      b.addEventListener("click", () => {
        if (blocked) return;
        $$(".part.selected", box).forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        state.part = opt.id;
        $("#btn-time-next").disabled = false;
      });
      box.appendChild(b);
    });
    $("#btn-time-next").disabled = state.part == null;
  }

  /* ---------- כרטיס הסיכום ---------- */

  function formatDate(day) {
    const date = new Date(C.date.year, C.date.month - 1, day);
    return fill(C.dateFormat.template, {
      weekday: C.dateFormat.weekdays[date.getDay()],
      day,
      month: C.date.monthName,
    });
  }

  function buildPerfEdges() {
    $$(".perf-edge").forEach((edge) => {
      edge.innerHTML = "";
      for (let i = 0; i < 16; i++) edge.appendChild(document.createElement("span"));
    });
    const bar = $("#barcode");
    bar.innerHTML = "";
    const widths = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 1, 1, 2, 3, 1, 4, 2, 1, 3, 1, 2, 1, 3, 2];
    widths.forEach((w) => {
      const s = document.createElement("span");
      s.style.width = w + "px";
      bar.appendChild(s);
    });
  }

  let readyBlob = null;
  let blobPromise = null;

  // הבחירות כטקסט, בשביל הכרטיס ובשביל הודעת הוואטסאפ
  function choiceTexts() {
    const opt = (step) => {
      const o = C[step].options[state[step]];
      return o ? o.name + " " + o.emoji : "";
    };
    const part = C.timeOfDay.options.find((o) => o.id === state.part);
    return {
      activity: opt("activity"),
      food: opt("food"),
      date: state.day ? formatDate(state.day) : "",
      time: part ? part.name + " " + part.emoji : "",
    };
  }

  function sendWhatsapp() {
    const text = fill(C.whatsapp.message, choiceTexts());
    const phone = String(C.whatsapp.phone || "").replace(/\D/g, "");
    const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
    window.open(url, "_blank");
  }

  function renderSummary() {
    const v = choiceTexts();
    const rows = [
      [C.summary.rows.activity, v.activity],
      [C.summary.rows.food, v.food],
      [C.summary.rows.date, v.date],
      [C.summary.rows.time, v.time],
    ];

    const box = $("#ticket-rows");
    box.innerHTML = "";
    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "ticket-row";
      const l = document.createElement("span");
      l.className = "row-label";
      l.textContent = label;
      const v = document.createElement("span");
      v.className = "row-value";
      v.textContent = value;
      row.append(l, v);
      box.appendChild(row);
    });

    setMsg("");
    readyBlob = null;
    blobPromise = null;
    setTimeout(bigConfetti, 300);
    // מכינים את התמונה מראש, כדי שחלון השיתוף באייפון ייפתח מיד בלחיצה
    setTimeout(() => {
      if (currentScreen === "summary") makeBlob().catch(() => {});
    }, 1200);
  }

  function makeBlob() {
    if (readyBlob) return Promise.resolve(readyBlob);
    if (blobPromise) return blobPromise;
    blobPromise = (async () => {
      if (typeof window.html2canvas !== "function") throw new Error("html2canvas missing");
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const el = $("#ticket-capture");
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
        logging: false,
        onclone: (doc) => doc.documentElement.classList.add("capturing"),
      });
      const blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png")
      );
      readyBlob = blob;
      return blob;
    })();
    blobPromise.catch(() => {
      blobPromise = null;
    });
    return blobPromise;
  }

  function setMsg(text) {
    const el = $("#save-msg");
    el.textContent = text;
    el.classList.remove("show");
    if (text) {
      void el.offsetWidth;
      el.classList.add("show");
    }
  }

  function download(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = C.summary.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // שיתוף רק במכשירי מגע (טלפון/טאבלט) – שם יש "שמירת תמונה" בחלון השיתוף
  function canShareFile(file) {
    const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return touch && navigator.canShare && navigator.share && navigator.canShare({ files: [file] });
  }

  let saving = false;

  async function saveTicket() {
    if (saving) return;
    saving = true;
    if (!readyBlob) setMsg(C.summary.savingMessage);
    try {
      const blob = await makeBlob();
      const file = new File([blob], C.summary.fileName, { type: "image/png" });
      if (canShareFile(file)) {
        try {
          await navigator.share({ files: [file], title: C.summary.shareTitle });
        } catch (err) {
          if (err && err.name === "AbortError") {
            setMsg("");
            return; // המשתמשת סגרה את חלון השיתוף
          }
          download(blob);
        }
      } else {
        download(blob);
      }
      setMsg(C.summary.successMessage);
      bigConfetti();
    } catch (err) {
      setMsg(C.summary.errorMessage);
    } finally {
      saving = false;
    }
  }

  /* ---------- פתיחת המעטפה ---------- */

  let opening = false;

  function openEnvelope() {
    if (opening) return;
    opening = true;
    $("#envelope").classList.add("open");
    setTimeout(() => {
      const c = elementCenter($("#envelope"));
      fire({ particleCount: 120, spread: 110, startVelocity: 38, origin: c, colors: CONFETTI_COLORS });
    }, 700);
    // אחרי שהמכתב יצא מהמעטפה – הוא מתרחב ונהיה דף השאלה
    setTimeout(letterToPage, 1350);
  }

  function setRect(el, r) {
    el.style.left = r.left + "px";
    el.style.top = r.top + "px";
    el.style.width = r.width + "px";
    el.style.height = r.height + "px";
  }

  function letterToPage() {
    if (currentScreen !== "welcome") return;

    // עותק של המכתב, בדיוק במקום של המכתב האמיתי
    const from = $(".env-letter").getBoundingClientRect();
    const fly = document.createElement("div");
    fly.className = "letter-fly";
    const label = document.createElement("span");
    label.textContent = C.welcome.letterText;
    fly.appendChild(label);
    setRect(fly, from);
    document.body.appendChild(fly);

    // כל השאר במסך הפתיחה נעלם בעדינות
    $("#screen-welcome").classList.add("leaving");

    setTimeout(() => {
      const card = $("#letter-card");
      card.classList.add("waiting");
      show("question");
      $("#screen-question").classList.add("no-enter");
      const to = card.getBoundingClientRect();

      const ease = " .75s cubic-bezier(.65, 0, .35, 1)";
      fly.style.transition = ["left", "top", "width", "height", "border-radius"].map((p) => p + ease).join(", ");
      fly.classList.add("growing");
      void fly.offsetWidth;
      setRect(fly, to);
      fly.style.borderRadius = "18px";

      // המכתב הגיע – מחליפים אותו בדף האמיתי והתוכן קופץ פנימה
      setTimeout(() => {
        card.classList.remove("waiting");
        card.classList.add("reveal");
        fly.remove();
      }, 780);
    }, 350);
  }

  /* ---------- התחלה מחדש ---------- */

  function restart() {
    state.activity = null;
    state.food = null;
    state.day = null;
    state.part = null;
    readyBlob = null;
    blobPromise = null;
    cardLock = false;
    opening = false;
    $("#envelope").classList.remove("open");
    $("#screen-welcome").classList.remove("leaving");
    $("#screen-question").classList.remove("no-enter");
    $("#letter-card").classList.remove("waiting", "reveal");
    $$(".letter-fly").forEach((f) => f.remove());
    resetNoButton();
    setMsg("");
    show("welcome");
    setTimeout(openingConfetti, 300);
  }

  /* ---------- הפעלה ---------- */

  function init() {
    applyTexts();
    buildFloaters();
    buildPerfEdges();
    setupStepHeaders();
    setupQuestion();

    $(".envelope-wrap").addEventListener("click", openEnvelope);
    $("#btn-whatsapp").addEventListener("click", sendWhatsapp);
    $("#btn-start").addEventListener("click", () => show("activity"));
    $("#btn-date-next").addEventListener("click", () => {
      if (state.day != null) show("time");
    });
    $("#btn-time-next").addEventListener("click", () => {
      if (state.part != null) show("summary");
    });
    $("#btn-save").addEventListener("click", saveTicket);
    $("#btn-restart").addEventListener("click", restart);

    show("welcome");
    setTimeout(openingConfetti, 500);
  }

  // לבדיקות בלבד
  window.__invite = { blockMessage, formatDate, state, show };

  init();
})();
