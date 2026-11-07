/*
 * ProHTML · browser-native glass interactions and anchored popovers.
 * Spring presets adapted from LiquidMorphPhysics in liquid_glass_widgets (MIT):
 * open {mass:1, stiffness:120, damping:16}, close {mass:1, stiffness:200, damping:21}.
 * Original browser geometry, accessibility, and interaction implementation.
 * See THIRD-PARTY-NOTICES.md and licenses/liquid_glass_widgets-LICENSE.txt.
 */
(function () {
  'use strict';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, min, max) => Math.max(min, Math.min(Math.max(min, max), value));
  const focus = element => {
    if (element && element.isConnected && typeof element.focus === 'function') {
      try { element.focus({preventScroll: true}); } catch (_) { element.focus(); }
    }
  };
  const profiles = {
    open: {mass: 1, stiffness: 120, damping: 16},
    close: {mass: 1, stiffness: 200, damping: 21},
    press: {mass: 1, stiffness: 360, damping: 23}
  };
  // Analytical solution of an underdamped spring's unit step response.
  function spring(time, profile) {
    const decay = profile.damping / (2 * profile.mass);
    const frequency = Math.sqrt(profile.stiffness / profile.mass - decay * decay);
    return 1 - Math.exp(-decay * time) *
      (Math.cos(frequency * time) + decay / frequency * Math.sin(frequency * time));
  }
  function frames(duration, profile, map, count = 46) {
    return Array.from({length: count + 1}, (_, i) => {
      const offset = i / count;
      return Object.assign({offset}, map(i === count ? 1 : spring(offset * duration / 1000, profile), offset));
    });
  }
  function run(element, keyframes, duration) {
    if (reducedMotion.matches || !element.animate) return null;
    const motion = element.animate(keyframes, {duration, easing: 'linear', fill: 'both'});
    // Canceled animations reject finished. Always attach a rejection handler.
    motion.finished.catch(() => {});
    return motion;
  }
  function dispose(motion) { if (motion) { try { motion.cancel(); } catch (_) {} } }
  const safeProbe = document.createElement('div');
  safeProbe.setAttribute('aria-hidden', 'true');
  safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(safeProbe);
  function viewportBounds() {
    const v = window.visualViewport;
    const css = getComputedStyle(safeProbe);
    const left = v ? v.offsetLeft : 0, top = v ? v.offsetTop : 0;
    const width = v ? v.width : document.documentElement.clientWidth;
    const height = v ? v.height : window.innerHeight;
    const b = {
      left: left + Math.max(12, parseFloat(css.paddingLeft) || 0),
      top: top + Math.max(12, parseFloat(css.paddingTop) || 0),
      right: left + width - Math.max(12, parseFloat(css.paddingRight) || 0),
      bottom: top + height - Math.max(12, parseFloat(css.paddingBottom) || 0)
    };
    b.width = Math.max(1, b.right - b.left);
    b.height = Math.max(1, b.bottom - b.top);
    return b;
  }
  function normalizeAnchor(value, fallback) {
    let element = value instanceof Element ? value : value && value.element;
    if (!element && value && value.currentTarget instanceof Element) element = value.currentTarget;
    if (!element && value && value.target instanceof Element) element = value.target.closest('button');
    element = element || fallback;
    const rect = element.getBoundingClientRect();
    // Explicit points are used only for right-click and long-press, never a stale
    // click event's clientX=0/clientY=0 from keyboard activation.
    const point = value && value.point === true && Number.isFinite(value.x) && Number.isFinite(value.y);
    const row = element.closest('.row');
    let selector = null;
    if (row && row.closest('#view')) {
      const key = row.dataset.id !== undefined ? '[data-id="' + CSS.escape(row.dataset.id) + '"]'
        : '[data-dir="' + CSS.escape(row.dataset.dir) + '"]';
      selector = '#view .row' + key + (element === row ? '' : element.matches('.row-more') ? ' .row-more' : ' .row-open');
    }
    return {element, selector, point, dx: point ? value.x - rect.left : 0, dy: point ? value.y - rect.top : 0};
  }

  class AnchoredMenus {
    constructor({layer, primary, secondary, onClose}) {
      this.layer = layer; this.primary = primary; this.secondary = secondary;
      this.onClose = onClose || (() => {});
      this.anchor = null; this.trigger = null; this.subTrigger = null;
      this.returnFocus = null; this.subOpen = false; this.closing = false;
      this.motions = new Set(); this.version = 0; this.raf = 0;
      this.background = [];
      this.schedule = () => {
        if (this.layer.hidden || this.closing || this.raf) return;
        this.raf = requestAnimationFrame(() => { this.raf = 0; this.layout(); });
      };
      layer.addEventListener('pointerdown', e => { this.outsideDown = !e.target.closest('.menu'); });
      layer.addEventListener('click', e => {
        if (this.outsideDown && !e.target.closest('.menu')) this.close();
        this.outsideDown = false;
      });
      document.addEventListener('keydown', e => this.keydown(e));
      document.addEventListener('focusin', e => {
        if (!layer.hidden && !this.closing && !layer.contains(e.target)) focus(this.actions()[0] || this.active());
      });
      addEventListener('resize', this.schedule);
      document.addEventListener('scroll', this.schedule, {capture: true, passive: true});
      const view = document.getElementById('view');
      if (view) new MutationObserver(this.schedule).observe(view, {childList: true, subtree: true});
      if (window.visualViewport) {
        visualViewport.addEventListener('resize', this.schedule);
        visualViewport.addEventListener('scroll', this.schedule);
      }
      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(this.schedule);
        this.resizeObserver.observe(primary); this.resizeObserver.observe(secondary);
      }
      reducedMotion.addEventListener && reducedMotion.addEventListener('change', () => {
        this.cancelMotions();
        if (this.closing) this.finishClose(this.version, false);
      });
    }
    active() { return this.subOpen ? this.secondary : this.primary; }
    actions(menu = this.active()) {
      return [...menu.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
        .filter(el => !el.hidden && el.getClientRects().length);
    }
    decorate(menu, label) {
      menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', label);
      menu.setAttribute('tabindex', '-1');
      menu.querySelectorAll('button').forEach(button => {
        const choice = /^(mode|net):/.test(button.dataset.a || '');
        button.setAttribute('role', choice ? 'menuitemradio' : 'menuitem'); button.type = 'button';
        if (choice) button.setAttribute('aria-checked', String(button.classList.contains('on')));
        else button.removeAttribute('aria-checked');
      });
      menu.querySelectorAll('hr').forEach(hr => hr.setAttribute('role', 'separator'));
    }
    anchorRect() {
      if (!this.anchor) return null;
      const a = this.anchor;
      // Progress scanning can redraw the library while a menu is open. Rebind
      // to the same file's replacement row, rather than jumping or dismissing.
      if (!a.element.isConnected) {
        const replacement = a.selector && document.querySelector(a.selector);
        if (!replacement) return null;
        const oldTrigger = this.trigger;
        a.element = replacement;
        this.trigger = replacement.matches('button') ? replacement : replacement.querySelector('.row-more, button') || replacement;
        this.trigger.classList.add('glass-menu-open');
        this.trigger.setAttribute('aria-haspopup', 'menu'); this.trigger.setAttribute('aria-expanded', 'true');
        this.trigger.setAttribute('aria-controls', this.primary.id);
        if (this.returnFocus === oldTrigger || !this.returnFocus || !this.returnFocus.isConnected) this.returnFocus = this.trigger;
        if (this.resizeObserver) {
          if (this.observedAnchor) this.resizeObserver.unobserve(this.observedAnchor);
          this.observedAnchor = replacement; this.resizeObserver.observe(replacement);
        }
      }
      const r = a.element.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      if (!a.point) return r;
      const x = r.left + clamp(a.dx, 0, r.width), y = r.top + clamp(a.dy, 0, r.height);
      return {left: x, right: x + 1, top: y, bottom: y + 1, width: 1, height: 1};
    }
    releaseTrigger() {
      if (this.trigger) {
        this.trigger.classList.remove('glass-menu-open');
        this.trigger.setAttribute('aria-expanded', 'false');
      }
      if (this.subTrigger) {
        this.subTrigger.classList.remove('submenu-active');
        this.subTrigger.setAttribute('aria-expanded', 'false');
      }
    }
    setBackgroundInert(inert) {
      if (inert) {
        this.background = ['home', 'reader'].map(id => document.getElementById(id)).filter(Boolean)
          .map(el => ({el, inert: el.inert}));
        this.background.forEach(({el}) => { el.inert = true; });
      } else {
        this.background.forEach(({el, inert: previous}) => { el.inert = previous; });
        this.background = [];
      }
    }
    cancelMotions() {
      this.motions.forEach(dispose); this.motions.clear();
      [this.primary, this.secondary].forEach(menu => {
        menu.style.transform = ''; menu.style.opacity = '';
        menu.classList.remove('is-materializing');
      });
    }
    open(anchor, {label = 'Options'} = {}) {
      this.version++; this.cancelMotions(); this.releaseTrigger(); this.setBackgroundInert(false);
      this.closing = false; this.subOpen = false; this.subTrigger = null; this.outsideDown = false;
      this.anchor = normalizeAnchor(anchor, document.getElementById('bAdd'));
      const el = this.anchor.element;
      this.trigger = el.matches('button') ? el : el.querySelector('.row-more, button') || el;
      this.returnFocus = this.trigger;
      this.layer.classList.remove('center', 'closing'); this.layer.hidden = false;
      this.primary.classList.remove('drill-behind'); this.primary.inert = false;
      this.primary.removeAttribute('aria-hidden'); this.secondary.hidden = true;
      this.trigger.classList.add('glass-menu-open');
      this.trigger.setAttribute('aria-haspopup', 'menu');
      this.trigger.setAttribute('aria-expanded', 'true');
      this.trigger.setAttribute('aria-controls', this.primary.id);
      this.decorate(this.primary, label);
      if (this.resizeObserver) {
        if (this.observedAnchor) this.resizeObserver.unobserve(this.observedAnchor);
        this.observedAnchor = el; this.resizeObserver.observe(el);
      }
      if (!this.layout()) return;
      // Move focus before making the rest of the app inert.
      focus(this.actions()[0] || this.primary); this.setBackgroundInert(true);
      this.morph(this.primary, this.anchorRect(), true);
    }
    placeAtAnchor(menu, rect, bounds) {
      const width = Math.min(296, bounds.width);
      menu.style.width = width + 'px'; menu.style.maxHeight = bounds.height + 'px';
      const wanted = menu.scrollHeight + 2;
      const gap = this.anchor.point ? 5 : 9;
      const below = bounds.bottom - rect.bottom - gap;
      const above = rect.top - bounds.top - gap;
      const bottom = below >= wanted || (above < wanted && below >= above);
      const space = Math.min(bounds.height, Math.max(88, bottom ? below : above));
      menu.style.maxHeight = space + 'px';
      const height = menu.offsetHeight;
      const leftHalf = (rect.left + rect.right) / 2 < (bounds.left + bounds.right) / 2;
      const x = clamp(leftHalf ? rect.left : rect.right - width, bounds.left, bounds.right - width);
      const y = clamp(bottom ? rect.bottom + gap : rect.top - gap - height, bounds.top, bounds.bottom - height);
      menu.style.left = Math.round(x) + 'px'; menu.style.top = Math.round(y) + 'px';
      menu.dataset.placement = (bottom ? 'bottom' : 'top') + (leftHalf ? '-start' : '-end');
      return {left: x, top: y, right: x + width, bottom: y + height, width, height};
    }
    layout() {
      if (this.layer.hidden || this.closing) return false;
      const rect = this.anchorRect(), bounds = viewportBounds();
      if (!rect || rect.bottom < bounds.top || rect.top > bounds.bottom || rect.right < bounds.left || rect.left > bounds.right) {
        this.close({immediate: true, restoreFocus: false}); return false;
      }
      const main = this.placeAtAnchor(this.primary, rect, bounds);
      if (!this.subOpen) return true;
      const sub = this.secondary, width = Math.min(296, bounds.width), gap = 9;
      const rightFits = main.right + gap + width <= bounds.right;
      const leftFits = main.left - gap - width >= bounds.left;
      const drill = !rightFits && !leftFits;
      // On a phone, drill into one anchored card instead of overlapping two
      // unreadably narrow cards. Desktop submenus originate beside their row.
      this.primary.classList.toggle('drill-behind', drill);
      this.primary.inert = drill;
      if (drill) this.primary.setAttribute('aria-hidden', 'true');
      else this.primary.removeAttribute('aria-hidden');
      sub.dataset.presentation = drill ? 'drill' : 'cascade';
      if (drill) this.placeAtAnchor(sub, rect, bounds);
      else {
        sub.style.width = width + 'px'; sub.style.maxHeight = bounds.height + 'px';
        const height = sub.offsetHeight;
        const source = this.subTrigger.getBoundingClientRect();
        const x = rightFits ? main.right + gap : main.left - gap - width;
        const y = clamp(source.top, bounds.top, bounds.bottom - height);
        sub.style.left = Math.round(x) + 'px'; sub.style.top = Math.round(y) + 'px';
        sub.dataset.placement = rightFits ? 'right' : 'left';
      }
      return true;
    }
    showSubmenu(trigger, label) {
      this.version++; this.cancelMotions();
      if (this.subTrigger) {
        this.subTrigger.classList.remove('submenu-active'); this.subTrigger.setAttribute('aria-expanded', 'false');
      }
      this.subTrigger = trigger; this.subOpen = true; this.secondary.hidden = false;
      trigger.classList.add('submenu-active'); trigger.setAttribute('aria-haspopup', 'menu');
      trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', this.secondary.id);
      this.decorate(this.secondary, label);
      // Focus first, then layout may make the primary menu inert on mobile.
      focus(this.actions()[0] || this.secondary);
      if (!this.layout()) return;
      this.morph(this.secondary,
        this.secondary.dataset.presentation === 'drill' ? this.anchorRect() : trigger.getBoundingClientRect(), true);
    }
    back() {
      if (!this.subOpen) return;
      this.version++; this.cancelMotions(); this.subOpen = false;
      this.secondary.hidden = true;
      this.primary.classList.remove('drill-behind'); this.primary.inert = false; this.primary.removeAttribute('aria-hidden');
      if (this.subTrigger) {
        this.subTrigger.classList.remove('submenu-active'); this.subTrigger.setAttribute('aria-expanded', 'false');
      }
      this.layout(); focus(this.subTrigger || this.actions()[0]);
    }
    morph(menu, source, opening) {
      if (!source || reducedMotion.matches || !menu.animate) return null;
      const width = menu.offsetWidth, height = menu.offsetHeight;
      const x = parseFloat(menu.style.left), y = parseFloat(menu.style.top);
      const dx = (source.left + source.right) / 2 - x - width / 2;
      const dy = (source.top + source.bottom) / 2 - y - height / 2;
      const sx = clamp((source.width || 24) / width, .075, .48);
      const sy = clamp((source.height || 24) / height, .075, .36);
      const duration = opening ? 660 : 290;
      const keyframes = frames(duration, opening ? profiles.open : profiles.close, (p, t) => {
        let progress = opening ? p : 1 - p;
        // Keep the spring's physical overshoot inside the viewport safety gap.
        const tx = progress > 1 ? clamp(dx * (1 - progress), -7, 7) : dx * (1 - progress);
        const ty = progress > 1 ? clamp(dy * (1 - progress), -7, 7) : dy * (1 - progress);
        return {
          transform: 'translate3d(' + tx.toFixed(3) + 'px,' + ty.toFixed(3) + 'px,0) scale(' +
            (sx + (1 - sx) * progress).toFixed(5) + ',' + (sy + (1 - sy) * progress).toFixed(5) + ')',
          opacity: opening ? Math.min(1, t * 8) : Math.max(0, 1 - t * 1.45)
        };
      });
      menu.classList.toggle('is-materializing', opening);
      const motion = run(menu, keyframes, duration);
      if (motion) {
        this.motions.add(motion);
        motion.finished.then(() => {
          this.motions.delete(motion); dispose(motion); menu.classList.remove('is-materializing');
        }).catch(() => {});
      }
      return motion;
    }
    close({restoreFocus = true, immediate = false} = {}) {
      if (this.layer.hidden || this.closing) return;
      const version = ++this.version;
      this.cancelMotions(); this.closing = true; this.layer.classList.add('closing');
      this.setBackgroundInert(false); this.releaseTrigger(); this.onClose();
      if (restoreFocus) focus(this.returnFocus);
      if (immediate || reducedMotion.matches || !this.primary.animate) { this.finishClose(version, false); return; }
      const source = this.anchorRect();
      const mainMotion = !this.primary.classList.contains('drill-behind') ? this.morph(this.primary, source, false) : null;
      const subMotion = this.subOpen ? this.morph(this.secondary, source, false) : null;
      const motions = [mainMotion, subMotion].filter(Boolean);
      Promise.all(motions.map(motion => motion.finished.catch(() => {}))).then(() => this.finishClose(version, false));
    }
    finishClose(version) {
      if (version !== this.version) return;
      this.cancelMotions(); this.layer.hidden = true; this.layer.classList.remove('closing');
      this.secondary.hidden = true; this.subOpen = false; this.closing = false;
      this.primary.inert = false; this.primary.classList.remove('drill-behind'); this.primary.removeAttribute('aria-hidden');
    }
    keydown(e) {
      if (this.layer.hidden || this.closing || e.defaultPrevented) return;
      const range = e.target instanceof HTMLInputElement && e.target.type === 'range';
      const actions = this.actions(), current = actions.indexOf(document.activeElement);
      let handled = true;
      switch (e.key) {
        case 'Escape': if (this.subOpen) this.back(); else this.close(); break;
        case 'Tab': focus(actions[(current + (e.shiftKey ? -1 : 1) + actions.length) % actions.length] || this.active()); break;
        case 'ArrowDown': if (!range) focus(actions[(current + 1) % actions.length]); else handled = false; break;
        case 'ArrowUp': if (!range) focus(actions[(current - 1 + actions.length) % actions.length]); else handled = false; break;
        case 'Home': if (!range) focus(actions[0]); else handled = false; break;
        case 'End': if (!range) focus(actions[actions.length - 1]); else handled = false; break;
        case 'ArrowLeft': if (!range && this.subOpen) this.back(); else handled = false; break;
        case 'ArrowRight':
          if (!range && /^(disp|net|font)$/.test(document.activeElement.dataset.a || '')) document.activeElement.click();
          else handled = false;
          break;
        default: handled = false;
      }
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    }
  }

  // One specular-light update per frame. Nothing runs continuously at rest.
  let lightFrame = 0, lastPointer = null;
  const lightSelector = '.tabs, .search, .addpill, .circ, .row-more, .menu';
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || reducedMotion.matches) return;
    const surface = e.target.closest(lightSelector);
    if (!surface) return;
    lastPointer = {surface, x: e.clientX, y: e.clientY};
    if (!lightFrame) lightFrame = requestAnimationFrame(() => {
      lightFrame = 0;
      if (!lastPointer || !lastPointer.surface.isConnected) return;
      const {surface: el, x, y} = lastPointer, r = el.getBoundingClientRect();
      el.style.setProperty('--light-x', clamp((x - r.left) / r.width * 100, 0, 100) + '%');
      el.style.setProperty('--light-y', clamp((y - r.top) / r.height * 100, 0, 100) + '%');
    });
  }, {passive: true});
  const pressed = new Map(), pressMotions = new WeakMap();
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || reducedMotion.matches) return;
    const button = e.target.closest('.plus, .circ, .row-more, .row-open, .big, .chip, .tabs button, .seg button');
    if (!button || button.disabled) return;
    const target = button.matches('.row-open') ? button.querySelector('.fi') : button;
    if (!target) return;
    dispose(pressMotions.get(target)); target.classList.add('is-pressed'); pressed.set(e.pointerId, target);
  }, {passive: true});
  function release(e) {
    const target = pressed.get(e.pointerId);
    if (!target) return;
    pressed.delete(e.pointerId); target.classList.remove('is-pressed');
    if (!target.isConnected || reducedMotion.matches) return;
    const animation = run(target, frames(430, profiles.press, p => ({transform: 'scale(' + (.95 + .05 * p) + ')'}), 30), 430);
    if (animation) {
      pressMotions.set(target, animation);
      animation.finished.then(() => { dispose(animation); pressMotions.delete(target); }).catch(() => {});
    }
  }
  document.addEventListener('pointerup', release, {passive: true});
  document.addEventListener('pointercancel', release, {passive: true});
  addEventListener('blur', () => { pressed.forEach(el => el.classList.remove('is-pressed')); pressed.clear(); });

  // The selected tab is a single sliding lens, not four independent flashes.
  const tabs = document.querySelector('.tabs');
  let lens, lensMotion, lensX = 0, lensWidth = 0, lensFrame = 0;
  function updateLens(animate = true) {
    if (!tabs) return;
    const selected = tabs.querySelector('[aria-selected="true"]');
    if (!selected) return;
    if (!lens) {
      lens = document.createElement('span'); lens.className = 'tab-lens'; lens.setAttribute('aria-hidden', 'true');
      tabs.prepend(lens); tabs.classList.add('has-lens'); animate = false;
    }
    const x = selected.offsetLeft, width = selected.offsetWidth;
    if (x === lensX && width === lensWidth && lens.style.width) return;
    const current = lens.getBoundingClientRect(), parent = tabs.getBoundingClientRect();
    const fromX = lensWidth ? current.left - parent.left + tabs.scrollLeft - tabs.clientLeft : x;
    const fromW = lensWidth ? current.width : width;
    dispose(lensMotion);
    lens.style.width = width + 'px'; lens.style.transform = 'translateX(' + x + 'px)';
    if (animate && !reducedMotion.matches && lensWidth) {
      lensMotion = run(lens, frames(580, profiles.open, p => ({
        transform: 'translateX(' + (fromX + (x - fromX) * p) + 'px)',
        width: (fromW + (width - fromW) * p) + 'px'
      })), 580);
      const motion = lensMotion;
      if (motion) motion.finished.then(() => dispose(motion)).catch(() => {});
    }
    lensX = x; lensWidth = width;
    tabs.querySelectorAll('[role="tab"]').forEach(b => { b.tabIndex = b === selected ? 0 : -1; });
  }
  function scheduleLens() {
    if (!lensFrame) lensFrame = requestAnimationFrame(() => { lensFrame = 0; updateLens(); });
  }
  if (tabs) {
    new MutationObserver(scheduleLens).observe(tabs, {attributes: true, subtree: true, attributeFilter: ['aria-selected']});
    if ('ResizeObserver' in window) new ResizeObserver(() => updateLens(false)).observe(tabs);
    addEventListener('resize', () => updateLens(false));
    tabs.addEventListener('keydown', e => {
      const buttons = [...tabs.querySelectorAll('[role="tab"]')], i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      let next;
      if (e.key === 'ArrowRight') next = buttons[(i + 1) % buttons.length];
      if (e.key === 'ArrowLeft') next = buttons[(i - 1 + buttons.length) % buttons.length];
      if (e.key === 'Home') next = buttons[0];
      if (e.key === 'End') next = buttons[buttons.length - 1];
      if (next) { e.preventDefault(); next.click(); focus(next); next.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'auto'}); }
    });
    requestAnimationFrame(() => updateLens(false));
  }
  window.ProGlass = Object.freeze({
    createMenus: options => new AnchoredMenus(options),
    refresh: scheduleLens,
    bounds: viewportBounds,
    reducedMotion: () => reducedMotion.matches
  });
})();
