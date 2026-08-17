(function (root) {
  "use strict";

  const TIPS = Object.freeze([
    "Barcode not scanning? Try taking a label photo instead.",
    "Keep the barcode flat and centered.",
    "Use bright, even lighting.",
    "Avoid glare on plastic packaging.",
    "Make sure the full ingredient label is visible.",
    "If the ingredients are tiny, move closer before taking the photo.",
  ]);
  const SEQUENCE = Object.freeze([
    ["idle", 350], ["entering", 430], ["scan_one", 540], ["scan_one_flash", 110],
    ["scan_two", 540], ["scan_two_flash", 110], ["scan_three", 540], ["scan_three_flash", 110],
    ["complete", 450], ["exiting", 320], ["result", 850], ["reset", 250],
  ]);

  const SVG = `
    <svg class="roots-scan-svg" viewBox="0 0 400 300" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <symbol id="roots-canonical-package" viewBox="130 48 140 222">
          <path class="package-shadow" d="M133 252c20 10 114 10 134 0"/>
          <path class="package-body" d="M137 54h126l-8 188c-1 14-12 23-26 23h-58c-14 0-25-9-26-23z"/>
          <path class="package-seal" d="M139 54h122l-7 25H146z"/>
          <path class="package-fold" d="M153 68h94"/>
          <rect class="package-label" x="157" y="104" width="86" height="92" rx="18"/>
          <path class="package-leaf" d="M198 140c-18-18-34 0-22 17 8 11 22 13 22 13s3-19 0-30zm4 30s5-27 26-30c8 23-9 32-26 30z"/>
          <path class="package-line" d="M178 183h44"/>
        </symbol>
        <clipPath id="roots-phone-screen-clip"><rect x="8" y="10" width="102" height="184" rx="14"/></clipPath>
      </defs>
      <g class="package-group"><use href="#roots-canonical-package" x="130" y="48" width="140" height="222"/></g>
      <g class="phone-group">
        <rect class="phone-body" x="0" y="0" width="118" height="204" rx="20"/>
        <rect class="phone-screen" x="8" y="10" width="102" height="184" rx="14"/>
        <circle class="phone-camera-dot" cx="59" cy="19" r="3"/>
        <g class="phone-view-package" clip-path="url(#roots-phone-screen-clip)"><use href="#roots-canonical-package" x="18" y="35" width="82" height="130"/></g>
        <rect class="phone-flash" x="8" y="10" width="102" height="184" rx="14"/>
        <g class="focus-frame">
          <path d="M25 64V49h15M78 49h15v15M93 139v15H78M40 154H25v-15"/>
        </g>
        <g class="scan-progress">
          <circle cx="49" cy="174" r="3"/><circle cx="59" cy="174" r="3"/><circle cx="69" cy="174" r="3"/>
        </g>
        <circle class="shutter-dot" cx="59" cy="185" r="5"/>
        <path class="scan-complete-mark" d="m50 135 7 7 14-16"/>
      </g>
      <g class="result-badge-group">
        <circle class="result-badge-shadow" cx="235" cy="75" r="29"/>
        <circle class="result-badge" cx="235" cy="71" r="27"/>
        <path class="result-check" d="m222 71 9 9 17-19"/>
      </g>
    </svg>`;

  function createController(options) {
    const doc = options.document, win = options.window, container = options.container;
    const tipText = options.tipText, homeView = options.homeView;
    const media = options.motionMedia || win.matchMedia("(prefers-reduced-motion: reduce)");
    const schedule = options.setTimeout || win.setTimeout.bind(win);
    const cancel = options.clearTimeout || win.clearTimeout.bind(win);
    const intervalMs = options.tipIntervalMs || 7000;
    let tipIndex = 0, sequenceIndex = 0, tipTimer = null, fadeTimer = null, animationTimer = null, destroyed = false;

    const homeActive = () => !!homeView && homeView.classList.contains("active");
    const active = () => !destroyed && homeActive() && !doc.hidden && !container.hidden && container.style.display !== "none";
    const shouldAnimate = () => active() && !media.matches;
    function clearTimer(name) {
      const value = name === "tip" ? tipTimer : animationTimer;
      if (value != null) { cancel(value); win.ROOTS_PERFORMANCE?.trackResource?.("home_timers", -1); }
      if (name === "tip") tipTimer = null; else animationTimer = null;
    }
    function setVisualState(name) {
      container.dataset.sequenceState = name;
      SEQUENCE.forEach(([state]) => container.classList.toggle(`state-${state}`, state === name));
    }
    function scheduleSequence() {
      clearTimer("animation");
      if (!shouldAnimate()) return;
      const [name, duration] = SEQUENCE[sequenceIndex];
      setVisualState(name);
      animationTimer = schedule(() => {
        animationTimer = null;
        win.ROOTS_PERFORMANCE?.trackResource?.("home_timers", -1);
        if (!shouldAnimate()) return;
        sequenceIndex = (sequenceIndex + 1) % SEQUENCE.length;
        scheduleSequence();
      }, duration);
      win.ROOTS_PERFORMANCE?.trackResource?.("home_timers", 1);
    }
    function scheduleTip() {
      clearTimer("tip");
      if (!shouldAnimate()) return;
      tipTimer = schedule(() => {
        tipTimer = null;
        win.ROOTS_PERFORMANCE?.trackResource?.("home_timers", -1);
        if (!shouldAnimate()) return;
        tipIndex = (tipIndex + 1) % TIPS.length;
        tipText.classList.add("is-changing");
        tipText.textContent = TIPS[tipIndex];
        if (fadeTimer != null) cancel(fadeTimer);
        fadeTimer = schedule(() => { fadeTimer = null; tipText.classList.remove("is-changing"); }, 180);
        scheduleTip();
      }, intervalMs);
      win.ROOTS_PERFORMANCE?.trackResource?.("home_timers", 1);
    }
    function sync() {
      const reduced = media.matches;
      container.classList.toggle("is-reduced", reduced);
      container.classList.toggle("is-paused", !active());
      container.dataset.animationState = reduced ? "reduced" : active() ? "running" : "paused";
      if (reduced) {
        clearTimer("animation");
        setVisualState("complete");
      } else if (shouldAnimate() && animationTimer == null) scheduleSequence();
      else if (!shouldAnimate()) clearTimer("animation");
      if (shouldAnimate()) scheduleTip(); else clearTimer("tip");
    }
    const onVisibility = () => sync(), onViewChange = () => sync(), onMotionChange = () => sync();
    const onThemeChange = () => sync();

    container.innerHTML = SVG;
    container.dataset.controllerCount = "1";
    tipText.textContent = TIPS[0];
    setVisualState("idle");
    doc.addEventListener("visibilitychange", onVisibility);
    doc.addEventListener("roots:viewchange", onViewChange);
    doc.addEventListener("roots:themechange", onThemeChange);
    if (media.addEventListener) media.addEventListener("change", onMotionChange); else media.addListener(onMotionChange);
    sync();

    return {
      sync,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        clearTimer("tip"); clearTimer("animation");
        if (fadeTimer != null) cancel(fadeTimer);
        fadeTimer = null;
        doc.removeEventListener("visibilitychange", onVisibility);
        doc.removeEventListener("roots:viewchange", onViewChange);
        doc.removeEventListener("roots:themechange", onThemeChange);
        if (media.removeEventListener) media.removeEventListener("change", onMotionChange); else media.removeListener(onMotionChange);
        container.dataset.animationState = "destroyed";
        container.dataset.controllerCount = "0";
      },
      getState: () => ({ running: shouldAnimate(), reducedMotion: media.matches, timerActive: tipTimer != null, animationTimerActive: animationTimer != null, sequenceState: container.dataset.sequenceState, tipIndex, destroyed }),
    };
  }

  function init() {
    if (root.ROOTS_HOME_ANIMATION?.instance) return root.ROOTS_HOME_ANIMATION.instance;
    const container = document.getElementById("scanAnimation");
    const tipText = document.getElementById("tip-text");
    const homeView = document.getElementById("scanView");
    if (!container || !tipText || !homeView) return null;
    const instance = createController({ document, window: root, container, tipText, homeView });
    root.ROOTS_HOME_ANIMATION.instance = instance;
    return instance;
  }

  function createProcessingController(options = {}) {
    const doc = options.document || document;
    const win = options.window || root;
    const motion = options.motionMedia || win.matchMedia?.("(prefers-reduced-motion: reduce)") || { matches: false };
    let container = options.container || null;
    let startedAt = 0;
    let running = false;
    let completionTimer = null;
    let generation = 0;

    function mount(target = container) {
      container = target;
      if (!container) return false;
      if (!container.querySelector(".roots-scan-svg")) container.innerHTML = SVG;
      container.dataset.processingAnimation = "mounted";
      container.classList.toggle("is-reduced", !!motion.matches);
      return true;
    }

    function start(startOptions = {}) {
      if (!mount(startOptions.container || container)) return false;
      generation += 1;
      if (completionTimer) win.clearTimeout(completionTimer);
      completionTimer = null;
      startedAt = Date.now();
      running = true;
      container.hidden = false;
      container.dataset.processingAnimation = motion.matches ? "static" : "running";
      container.dataset.sourceType = startOptions.sourceType || "label";
      return generation;
    }

    function setStage(stage) {
      if (!container) return;
      container.dataset.stage = String(stage || "");
    }

    function stop() {
      generation += 1;
      if (completionTimer) win.clearTimeout(completionTimer);
      completionTimer = null;
      running = false;
      if (container) container.dataset.processingAnimation = "stopped";
    }

    function fail() {
      stop();
      if (container) container.dataset.processingAnimation = "failed";
    }

    function complete(resultType) {
      if (!container || !running) return Promise.resolve(false);
      const currentGeneration = generation;
      const remaining = Math.max(0, 550 - (Date.now() - startedAt));
      container.dataset.resultType = resultType || "complete";
      container.dataset.processingAnimation = motion.matches ? "static-complete" : "completing";
      return new Promise((resolve) => {
        completionTimer = win.setTimeout(() => {
          completionTimer = null;
          if (currentGeneration !== generation) return resolve(false);
          running = false;
          container.dataset.processingAnimation = "complete";
          resolve(true);
        }, remaining);
      });
    }

    function reset() {
      stop();
      if (!container) return;
      container.removeAttribute("data-stage");
      container.removeAttribute("data-result-type");
      container.dataset.processingAnimation = "mounted";
    }

    return {
      mount,
      start,
      setStage,
      complete,
      fail,
      stop,
      reset,
      getState: () => ({ running, reducedMotion: !!motion.matches, startedAt, generation }),
    };
  }

  function initProcessing() {
    if (root.ROOTS_PROCESSING_ANIMATION?.instance) return root.ROOTS_PROCESSING_ANIMATION.instance;
    const container = document.getElementById("processing-animation");
    if (!container) return null;
    const instance = createProcessingController({ document, window: root, container });
    instance.mount();
    root.ROOTS_PROCESSING_ANIMATION.instance = instance;
    return instance;
  }

  root.ROOTS_HOME_ANIMATION = { TIPS, SEQUENCE, SVG, createController, init, instance: null };
  root.ROOTS_PROCESSING_ANIMATION = {
    createController: createProcessingController,
    init: initProcessing,
    instance: null,
    mount(container, options) { return (this.instance || initProcessing())?.mount(container, options); },
    start(options) { return (this.instance || initProcessing())?.start(options); },
    setStage(stage, detail) { return (this.instance || initProcessing())?.setStage(stage, detail); },
    complete(resultType) { return (this.instance || initProcessing())?.complete(resultType); },
    fail() { return (this.instance || initProcessing())?.fail(); },
    stop() { return (this.instance || initProcessing())?.stop(); },
    reset() { return (this.instance || initProcessing())?.reset(); },
  };
})(typeof window !== "undefined" ? window : globalThis);
