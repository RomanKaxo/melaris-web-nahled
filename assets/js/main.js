// Vlastní implementace živých schémat: vanilla JS a SVG, bez knihoven.
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bez úložiště */ } }
  };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var userPaused = store.get('melaris-motion') === 'off';
  var widgets = [];
  var frame = 0;
  var last = 0;

  function motionOn() { return !reduced.matches && !userPaused; }
  function ease(t) { return t * t * (3 - 2 * t); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function el(name, attrs, parent) {
    var node = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  // Jedna společná smyčka; schéma mimo okno se nepřekresluje.
  function loop(now) {
    frame = 0;
    if (!motionOn()) return;
    var dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    widgets.forEach(function (w) { if (w.visible) w.tick(dt, now); });
    frame = requestAnimationFrame(loop);
  }
  function syncMotion() {
    root.dataset.motion = motionOn() ? 'on' : 'off';
    var button = document.getElementById('motion-toggle');
    if (button) {
      var label = reduced.matches ? 'Pohyb je vypnutý v nastavení systému' : (userPaused ? 'Spustit animace' : 'Zastavit animace');
      button.setAttribute('aria-pressed', String(!motionOn()));
      button.setAttribute('aria-label', label);
      button.title = label;
      button.disabled = reduced.matches;
    }
    if (motionOn()) {
      if (!frame) { last = performance.now(); frame = requestAnimationFrame(loop); }
    } else {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      widgets.forEach(function (w) { w.still(); });
    }
  }
  function register(node, widget) {
    widget.visible = false;
    widgets.push(widget);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        widget.visible = entries[entries.length - 1].isIntersecting;
      }, { rootMargin: '60px' }).observe(node);
    } else {
      widget.visible = true;
    }
    widget.still();
  }

  // Dráty mezi prvky se počítají ze skutečné pozice, proto sedí na každé šířce.
  function pointsBetween(box, a, b) {
    var ra = a.getBoundingClientRect();
    var rb = b.getBoundingClientRect();
    var phone = window.matchMedia('(max-width:719px)').matches;
    var side = !phone && (rb.left >= ra.right - 1 || ra.left >= rb.right - 1);
    if (side) {
      var fromLeft = ra.left < rb.left;
      return {
        x1: (fromLeft ? ra.right : ra.left) - box.left, y1: ra.top + ra.height / 2 - box.top,
        x2: (fromLeft ? rb.left : rb.right) - box.left, y2: rb.top + rb.height / 2 - box.top,
        side: true
      };
    }
    var fromTop = ra.top < rb.top;
    return {
      x1: ra.left + ra.width / 2 - box.left, y1: (fromTop ? ra.bottom : ra.top) - box.top,
      x2: rb.left + rb.width / 2 - box.left, y2: (fromTop ? rb.top : rb.bottom) - box.top,
      side: false
    };
  }
  function curve(p) {
    if (p.side) {
      var mx = (p.x1 + p.x2) / 2;
      return 'M' + p.x1 + ' ' + p.y1 + 'C' + mx + ' ' + p.y1 + ' ' + mx + ' ' + p.y2 + ' ' + p.x2 + ' ' + p.y2;
    }
    var my = (p.y1 + p.y2) / 2;
    return 'M' + p.x1 + ' ' + p.y1 + 'C' + p.x1 + ' ' + my + ' ' + p.x2 + ' ' + my + ' ' + p.x2 + ' ' + p.y2;
  }
  function elbow(p) {
    if (p.side) {
      var mx = (p.x1 + p.x2) / 2;
      return 'M' + p.x1 + ' ' + p.y1 + 'H' + mx + 'V' + p.y2 + 'H' + p.x2;
    }
    var my = (p.y1 + p.y2) / 2;
    return 'M' + p.x1 + ' ' + p.y1 + 'V' + my + 'H' + p.x2 + 'V' + p.y2;
  }
  function fitSvg(svg, box) {
    svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', box.height);
  }

  // Hero: běh putuje po tvaru písmene M.
  function initHero() {
    var figure = document.getElementById('hero-m');
    var trail = document.getElementById('run-trail');
    var dot = document.getElementById('run-dot');
    if (!figure || !trail || !dot) return;
    var stops = Array.prototype.slice.call(figure.querySelectorAll('.stop'));
    var at = [0, 0.27, 0.5, 0.73, 1];
    var length = trail.getTotalLength();
    var time = 0;
    var TRAVEL = 7;
    var REST = 1.6;
    trail.setAttribute('stroke-dasharray', length + ' ' + length);
    function draw(p) {
      var point = trail.getPointAtLength(length * p);
      dot.setAttribute('cx', point.x);
      dot.setAttribute('cy', point.y);
      trail.setAttribute('stroke-dashoffset', length * (1 - p));
      stops.forEach(function (stop, i) { stop.classList.toggle('on', p >= at[i] - 0.005); });
    }
    register(figure, {
      tick: function (dt) {
        time = (time + dt) % (TRAVEL + REST);
        draw(ease(clamp(time / TRAVEL, 0, 1)));
      },
      still: function () { draw(1); }
    });
  }

  // Schéma 1: vstupy, uzel Melarisu a hromádka výstupů.
  function initFlow() {
    var fig = document.getElementById('flow');
    if (!fig) return;
    var svg = fig.querySelector('.wires');
    var hubNode = fig.querySelector('[data-hub]');
    var stack = fig.querySelector('[data-stack]');
    var planned = fig.querySelector('[data-planned]');
    var counter = fig.querySelector('[data-counter]');
    var inputs = Array.prototype.slice.call(fig.querySelectorAll('[data-in]'));
    var sheets = Array.prototype.slice.call(stack.querySelectorAll('.sheet'));
    var wires = [];
    var out = null;
    var outDot = null;
    var outT = 0;
    var count = 0;
    var PERIOD = 2.8;

    function layout() {
      var box = fig.getBoundingClientRect();
      if (!box.width) return;
      fitSvg(svg, box);
      svg.textContent = '';
      wires = inputs.map(function (node, i) {
        var path = el('path', { class: 'wire', d: curve(pointsBetween(box, node, hubNode)) }, svg);
        return { path: path, dot: el('circle', { class: 'wire-dot', r: 3.5 }, svg), t: i * 0.47 };
      });
      out = el('path', { class: 'wire wire-strong', d: curve(pointsBetween(box, hubNode, stack)) }, svg);
      outDot = el('circle', { class: 'wire-dot', r: 4 }, svg);
      el('path', { class: 'wire wire-planned', d: curve(pointsBetween(box, hubNode, planned)) }, svg);
      place(0);
    }
    function place(dt) {
      wires.forEach(function (w) {
        w.t = (w.t + dt / 2.35) % 1;
        var p = w.path.getPointAtLength(w.path.getTotalLength() * ease(w.t));
        w.dot.setAttribute('cx', p.x);
        w.dot.setAttribute('cy', p.y);
      });
      if (out) {
        var q = out.getPointAtLength(out.getTotalLength() * clamp(outT / 1.1, 0, 1));
        outDot.setAttribute('cx', q.x);
        outDot.setAttribute('cy', q.y);
      }
    }
    function print() {
      count = count >= 99 ? 1 : count + 1;
      counter.textContent = 'Ukázkový výstup č. ' + count;
      var front = sheets.pop();
      sheets.unshift(front);
      sheets.forEach(function (sheet, i) {
        sheet.classList.remove('s0', 's1', 's2', 'printing');
        sheet.classList.add('s' + i);
      });
      stack.appendChild(sheets[0]);
      // Vynucené přepočítání restartuje animaci tisku u stejného prvku.
      void sheets[0].getBoundingClientRect();
      sheets[0].classList.add('printing');
    }
    layout();
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(fig);
    register(fig, {
      tick: function (dt) {
        outT += dt;
        if (outT >= PERIOD) { outT = 0; print(); }
        place(dt);
      },
      still: function () {
        wires.forEach(function (w, i) { w.t = 0.2 + i * 0.13; });
        outT = 0.5;
        place(0);
        sheets.forEach(function (s) { s.classList.remove('printing'); });
        counter.textContent = 'Ukázkový výstup';
      }
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    window.addEventListener('load', layout);
  }

  // Schéma 2: rozbočovač s dlaždicemi, po jedné se připojují.
  function initHub() {
    var fig = document.getElementById('hub');
    if (!fig) return;
    var svg = fig.querySelector('.wires');
    var node = fig.querySelector('[data-hub]');
    var tiles = Array.prototype.slice.call(fig.querySelectorAll('.tile'));
    var nameEl = document.getElementById('hub-name');
    var detailEl = document.getElementById('hub-detail');
    var sync = document.getElementById('hub-sync');
    var wires = [];
    var dot = null;
    var current = 0;
    var t = 0;
    var hold = false;
    var PERIOD = 3;

    function layout() {
      var box = fig.getBoundingClientRect();
      if (!box.width) return;
      fitSvg(svg, box);
      svg.textContent = '';
      wires = tiles.map(function (tile) {
        return el('path', { class: 'wire', d: elbow(pointsBetween(box, tile, node)) }, svg);
      });
      dot = el('circle', { class: 'wire-dot', r: 3.5 }, svg);
      select(current, false);
    }
    function placeDot(p) {
      var wire = wires[current];
      if (!wire) return;
      var q = wire.getPointAtLength(wire.getTotalLength() * p);
      dot.setAttribute('cx', q.x);
      dot.setAttribute('cy', q.y);
    }
    function select(index, announce) {
      current = index;
      tiles.forEach(function (tile, i) {
        var on = i === index;
        tile.classList.toggle('on', on);
        tile.setAttribute('aria-pressed', String(on));
        if (wires[i]) {
          wires[i].classList.toggle('wire-on', on);
          if (on) wires[i].parentNode.insertBefore(wires[i], dot);
        }
      });
      sync.setAttribute('aria-live', announce ? 'polite' : 'off');
      nameEl.textContent = tiles[index].querySelector('span:last-child').textContent;
      detailEl.textContent = tiles[index].dataset.detail;
      placeDot(1);
    }
    tiles.forEach(function (tile, i) {
      tile.addEventListener('pointerenter', function () { hold = true; select(i, false); });
      tile.addEventListener('pointerleave', function () { hold = false; t = 0; });
      tile.addEventListener('focus', function () { hold = true; select(i, true); });
      tile.addEventListener('blur', function () { hold = false; t = 0; });
      tile.addEventListener('click', function () { select(i, true); });
    });
    layout();
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(fig);
    register(fig, {
      tick: function (dt) {
        t += dt;
        placeDot(ease(clamp(t / 1.2, 0, 1)));
        if (!hold && t >= PERIOD) { t = 0; select((current + 1) % tiles.length, false); placeDot(0); }
      },
      still: function () { t = 0; placeDot(1); }
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    window.addEventListener('load', layout);
  }

  // Schéma 3: kroky běhu, jde po nich přejíždět.
  // Obrazovky: jeden otevřený bod, kresba vedle něj, na telefonu přímo pod ním.
  function initUiPanel() {
    var panel = document.querySelector('[data-ui-panel]');
    if (!panel) return;
    var rows = Array.prototype.slice.call(panel.querySelectorAll('.ui-list li')).map(function (li) {
      return { item: li.querySelector('.ui-item'), button: li.querySelector('.ui-btn'), fig: li.querySelector('.ui-fig') };
    });
    function show(index, animate) {
      rows.forEach(function (row, i) {
        var on = i === index;
        row.item.classList.toggle('on', on);
        row.button.setAttribute('aria-expanded', String(on));
        row.fig.hidden = !on;
        row.fig.classList.toggle('enter', on && animate);
      });
    }
    rows.forEach(function (row, i) {
      row.item.addEventListener('click', function () {
        if (row.fig.hidden) show(i, true);
      });
    });
    show(0, false);
    panel.classList.add('ready');
  }

  function initGates() {
    var fig = document.getElementById('gates');
    if (!fig) return;
    var points = [[40, 212], [140, 182], [240, 152], [340, 104], [440, 72], [560, 40]];
    var chart = fig.querySelector('[data-chart]');
    var range = fig.querySelector('[data-range]');
    var steps = Array.prototype.slice.call(fig.querySelectorAll('[data-steps] > li'));
    var list = fig.querySelector('[data-steps]');
    var curveEl = fig.querySelector('[data-curve]');
    var curveOn = fig.querySelector('[data-curve-on]');
    var area = fig.querySelector('[data-area]');
    var clip = fig.querySelector('[data-clip]');
    var marks = fig.querySelector('[data-marks]');
    var head = fig.querySelector('[data-head]');
    var ring = fig.querySelector('[data-head-ring]');
    var pill = fig.querySelector('[data-pill]');
    var note = fig.querySelector('[data-gate-note]');
    var svg = chart.querySelector('svg');
    var titles = steps.map(function (s) { return s.querySelector('h4').textContent; });

    function segment(a, b) {
      var mx = (a[0] + b[0]) / 2;
      return 'C' + mx + ' ' + a[1] + ' ' + mx + ' ' + b[1] + ' ' + b[0] + ' ' + b[1];
    }
    var d = 'M' + points[0][0] + ' ' + points[0][1];
    var lengths = [0];
    var probe = el('path', {});
    for (var i = 1; i < points.length; i++) {
      d += segment(points[i - 1], points[i]);
      probe.setAttribute('d', d);
      lengths.push(probe.getTotalLength());
    }
    curveEl.setAttribute('d', d);
    curveOn.setAttribute('d', d);
    var total = lengths[lengths.length - 1];
    curveOn.setAttribute('stroke-dasharray', total + ' ' + total);
    area.setAttribute('d', d + 'L560 244H40Z');
    points.forEach(function (p) { el('circle', { class: 'mark', cx: p[0], cy: p[1], r: 4 }, marks); });
    var markEls = Array.prototype.slice.call(marks.children);

    var pos = 0;
    var target = 0;
    var wait = 0;
    var holdUntil = 0;
    var DWELL = 2.8;

    note.style.left = (340 / 600 * 100) + '%';
    root.classList.add('gates-ready');

    function lengthAt(p) {
      var a = Math.floor(p);
      var b = Math.min(lengths.length - 1, a + 1);
      return lengths[a] + (lengths[b] - lengths[a]) * (p - a);
    }
    function draw() {
      var len = lengthAt(pos);
      var q = curveEl.getPointAtLength(len);
      head.setAttribute('cx', q.x);
      head.setAttribute('cy', q.y);
      ring.setAttribute('cx', q.x);
      ring.setAttribute('cy', q.y);
      curveOn.setAttribute('stroke-dashoffset', total - len);
      clip.setAttribute('width', q.x);
      markEls.forEach(function (m, i) { m.classList.toggle('on', i <= pos + 0.02); });
      pill.style.left = clamp(q.x / 600 * 100, 13, 87) + '%';
      pill.style.top = (q.y / 260 * 100) + '%';
    }
    function show(index, announce) {
      target = index;
      range.value = String(index);
      range.setAttribute('aria-valuetext', titles[index]);
      list.setAttribute('aria-live', announce ? 'polite' : 'off');
      steps.forEach(function (s, i) { s.hidden = i !== index; });
      pill.textContent = titles[index];
    }
    function interact(index) {
      holdUntil = performance.now() + 9000;
      wait = 0;
      show(index, true);
      if (!motionOn()) { pos = index; draw(); }
    }
    range.addEventListener('input', function () { interact(Number(range.value)); });
    chart.addEventListener('pointermove', function (event) {
      var rect = svg.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width * 600;
      var best = 0;
      points.forEach(function (p, i) { if (Math.abs(p[0] - x) < Math.abs(points[best][0] - x)) best = i; });
      if (best !== target || event.pointerType !== 'mouse') interact(best);
      holdUntil = performance.now() + 9000;
    });
    show(0, false);
    draw();
    register(fig, {
      tick: function (dt, now) {
        var diff = target - pos;
        if (Math.abs(diff) > 0.002) {
          pos += clamp(diff, -dt * 2.2, dt * 2.2);
          draw();
        } else if (pos !== target) {
          pos = target;
          draw();
        }
        if (now > holdUntil) {
          wait += dt;
          if (wait >= DWELL) {
            wait = 0;
            if (target === points.length - 1) { pos = 0; show(0, false); } else { show(target + 1, false); }
          }
        }
      },
      still: function () { pos = target; draw(); }
    });
  }

  // Zobrazení při vjezdu do okna, po částech sekce.
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.rv'));
    if (!('IntersectionObserver' in window)) { items.forEach(function (i) { i.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.style.transitionDelay = (n++ * 70) + 'ms';
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    items.forEach(function (i) { io.observe(i); });
  }

  // Na telefonu jsou skupiny funkcí sbalené, jinak by stránka byla zbytečně dlouhá.
  function initGroups() {
    var groups = Array.prototype.slice.call(document.querySelectorAll('.fg'));
    var phone = window.matchMedia('(max-width:719px)');
    function apply() {
      groups.forEach(function (group, i) {
        var title = group.querySelector('h3');
        var grid = group.querySelector('.fgrid');
        var name = title.textContent;
        title.textContent = '';
        if (phone.matches) {
          var button = document.createElement('button');
          var open = i === 0;
          button.type = 'button';
          button.className = 'fg-btn';
          button.textContent = name;
          button.setAttribute('aria-expanded', String(open));
          grid.hidden = !open;
          button.addEventListener('click', function () {
            var next = button.getAttribute('aria-expanded') !== 'true';
            button.setAttribute('aria-expanded', String(next));
            grid.hidden = !next;
          });
          title.appendChild(button);
        } else {
          title.textContent = name;
          grid.hidden = false;
        }
      });
    }
    apply();
    if (phone.addEventListener) phone.addEventListener('change', apply);
  }

  function initTheme() {
    var button = document.getElementById('theme-toggle');
    if (!button) return;
    button.addEventListener('click', function () {
      var dark = root.dataset.theme ? root.dataset.theme === 'dark' : !window.matchMedia('(prefers-color-scheme: light)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      store.set('melaris-theme', root.dataset.theme);
    });
  }

  function initMotionToggle() {
    var button = document.getElementById('motion-toggle');
    if (!button) return;
    button.addEventListener('click', function () {
      userPaused = !userPaused;
      store.set('melaris-motion', userPaused ? 'off' : 'on');
      syncMotion();
    });
    if (reduced.addEventListener) reduced.addEventListener('change', syncMotion);
  }

  initTheme();
  initMotionToggle();
  initGroups();
  initReveal();
  initHero();
  initFlow();
  initHub();
  initGates();
  initUiPanel();
  syncMotion();
})();
