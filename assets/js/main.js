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
  // Zastavení pohybu platí jen do zavření karty, aby web nezůstal omylem navždy bez animací.
  var session = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* bez úložiště */ } }
  };
  try { localStorage.removeItem('melaris-motion'); } catch (e) { /* bez úložiště */ }
  var userPaused = session.get('melaris-motion') === 'off';
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

  // Obrazovky: jeden otevřený bod. Na počítači karta vedle seznamu, jinak se rozbalí přímo v položce.
  function initUiPanel() {
    var panel = document.querySelector('[data-ui-panel]');
    if (!panel) return;
    var rows = Array.prototype.slice.call(panel.querySelectorAll('.ui-list li')).map(function (li) {
      return { li: li, button: li.querySelector('.ui-btn'), fig: li.querySelector('.ui-fig'), anim: null };
    });
    var wide = window.matchMedia('(min-width:1024px)');
    var EASE = 'cubic-bezier(.4,0,.2,1)';
    var current = 0;
    // Stejně jako předloha: na počítači rám stojí a mění se obsah, nejdřív odchod, pak příchod.
    function run(row, node, frames, options, done) {
      if (row.anim) row.anim.cancel();
      options.duration = 350;
      options.easing = EASE;
      row.anim = node.animate(frames, options);
      row.anim.onfinish = function () { row.anim = null; if (done) done(); };
    }
    function target(row) { return wide.matches ? row.fig.querySelector('svg') : row.fig; }
    function leave(row) {
      row.fig.classList.add('leave');
      var height = row.fig.offsetHeight;
      run(row, target(row), wide.matches
        ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(.98)' }]
        : [{ height: height + 'px', marginBottom: '16px', opacity: 1 }, { height: 0, marginBottom: 0, opacity: 0 }],
      {}, function () { row.fig.classList.remove('leave'); });
    }
    function enter(row) {
      var height = row.fig.offsetHeight;
      run(row, target(row), wide.matches
        ? [{ opacity: 0, transform: 'translateY(12px) scale(.98)' }, { opacity: 1, transform: 'none' }]
        : [{ height: 0, marginBottom: 0, opacity: 0 }, { height: height + 'px', marginBottom: '16px', opacity: 1 }],
      wide.matches ? { delay: 350, fill: 'backwards' } : {});
    }
    function show(index, animate) {
      var moving = animate && motionOn() && index !== current && !!rows[0].fig.animate;
      rows.forEach(function (row, i) {
        var on = i === index;
        if (row.anim) { row.anim.cancel(); row.anim = null; }
        row.fig.classList.remove('leave');
        row.li.classList.toggle('on', on);
        row.button.setAttribute('aria-expanded', String(on));
        row.fig.hidden = !on;
      });
      if (moving) { leave(rows[current]); enter(rows[index]); }
      current = index;
    }
    rows.forEach(function (row, i) {
      row.button.dataset.delay = String(i * 70);
      row.button.addEventListener('click', function () { show(i, true); });
    });
    show(0, false);
    panel.classList.add('ready');
  }

  // Schéma 3: kroky běhu, jde po nich přejíždět. Křivka se počítá ze skutečné velikosti grafu.
  function initGates() {
    var fig = document.getElementById('gates');
    if (!fig) return;
    var chart = fig.querySelector('[data-chart]');
    var range = fig.querySelector('[data-range]');
    var steps = Array.prototype.slice.call(fig.querySelectorAll('[data-steps] > li'));
    var list = fig.querySelector('[data-steps]');
    var curveEl = fig.querySelector('[data-curve]');
    var curveOn = fig.querySelector('[data-curve-on]');
    var area = fig.querySelector('[data-area]');
    var clip = fig.querySelector('[data-clip]');
    var marks = fig.querySelector('[data-marks]');
    var labels = fig.querySelector('[data-labels]');
    var human = fig.querySelector('[data-human]');
    var head = fig.querySelector('[data-head]');
    var ring = fig.querySelector('[data-head-ring]');
    var pill = fig.querySelector('[data-pill]');
    var note = fig.querySelector('[data-gate-note]');
    var svg = chart.querySelector('svg');
    var titles = steps.map(function (s) { return s.querySelector('h4').textContent; });
    var LEVELS = [0.78, 0.68, 0.56, 0.38, 0.26, 0.14];
    var HUMAN = 3;
    // Polovina jezdce: značky na křivce leží přesně nad jeho polohami.
    var INSET = 13;
    var points = [];
    var lengths = [0];
    var markEls = [];
    var labelEls = [];
    var total = 1;
    var width = 1;
    var height = 1;

    var pos = 0;
    var target = 0;
    // První krok přijde krátce po vjezdu do okna, ať schéma nepůsobí zamrzle.
    var wait = 1.4;
    var holdUntil = 0;
    var DWELL = 2;

    function segment(a, b) {
      var mx = (a[0] + b[0]) / 2;
      return 'C' + mx + ' ' + a[1] + ' ' + mx + ' ' + b[1] + ' ' + b[0] + ' ' + b[1];
    }
    function layout() {
      var box = chart.getBoundingClientRect();
      if (!box.width) return;
      width = box.width;
      height = box.height;
      fitSvg(svg, box);
      var floor = height - 30;
      points = LEVELS.map(function (level, i) {
        return [INSET + i * (width - 2 * INSET) / (LEVELS.length - 1), level * floor];
      });
      var d = 'M' + points[0][0] + ' ' + points[0][1];
      var probe = el('path', {});
      lengths = [0];
      for (var i = 1; i < points.length; i++) {
        d += segment(points[i - 1], points[i]);
        probe.setAttribute('d', d);
        lengths.push(probe.getTotalLength());
      }
      curveEl.setAttribute('d', d);
      curveOn.setAttribute('d', d);
      total = lengths[lengths.length - 1];
      curveOn.setAttribute('stroke-dasharray', total + ' ' + total);
      area.setAttribute('d', d + 'L' + points[points.length - 1][0] + ' ' + floor + 'H' + points[0][0] + 'Z');
      human.setAttribute('d', 'M' + points[HUMAN][0] + ' 22V' + floor);
      note.style.left = points[HUMAN][0] + 'px';
      marks.textContent = '';
      labels.textContent = '';
      markEls = points.map(function (p) { return el('circle', { class: 'mark', cx: p[0], cy: p[1], r: 4 }, marks); });
      labelEls = points.map(function (p, i) {
        var anchor = i === 0 ? 'start' : (i === points.length - 1 ? 'end' : 'middle');
        var text = el('text', { class: 'gate-lab', x: i === 0 ? 0 : (i === points.length - 1 ? width : p[0]), y: height - 6, 'text-anchor': anchor }, labels);
        text.textContent = titles[i];
        return text;
      });
      draw();
    }
    function lengthAt(p) {
      var a = Math.floor(p);
      var b = Math.min(lengths.length - 1, a + 1);
      return lengths[a] + (lengths[b] - lengths[a]) * (p - a);
    }
    function draw() {
      if (!points.length) return;
      var len = lengthAt(pos);
      var q = curveEl.getPointAtLength(len);
      head.setAttribute('cx', q.x);
      head.setAttribute('cy', q.y);
      ring.setAttribute('cx', q.x);
      ring.setAttribute('cy', q.y);
      curveOn.setAttribute('stroke-dashoffset', total - len);
      clip.setAttribute('width', q.x);
      markEls.forEach(function (m, i) { m.classList.toggle('on', i <= pos + 0.02); });
      labelEls.forEach(function (l, i) { l.classList.toggle('on', i === target); });
      var half = pill.offsetWidth / 2;
      pill.style.left = clamp(q.x, half, Math.max(half, width - half)) + 'px';
      pill.style.top = q.y + 'px';
    }
    function show(index, announce) {
      target = index;
      range.value = String(index);
      range.setAttribute('aria-valuetext', titles[index]);
      list.setAttribute('aria-live', announce ? 'polite' : 'off');
      steps.forEach(function (s, i) { s.hidden = i !== index; });
      pill.textContent = titles[index];
      labelEls.forEach(function (l, i) { l.classList.toggle('on', i === index); });
    }
    function interact(index) {
      holdUntil = performance.now() + 9000;
      wait = 0;
      show(index, true);
      if (!motionOn()) { pos = index; draw(); }
    }
    range.addEventListener('input', function () { interact(Number(range.value)); });
    chart.addEventListener('pointermove', function (event) {
      var x = event.clientX - svg.getBoundingClientRect().left;
      var best = 0;
      points.forEach(function (p, i) { if (Math.abs(p[0] - x) < Math.abs(points[best][0] - x)) best = i; });
      if (best !== target || event.pointerType !== 'mouse') interact(best);
      holdUntil = performance.now() + 9000;
    });
    root.classList.add('gates-ready');
    show(0, false);
    layout();
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(chart);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    window.addEventListener('load', layout);
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
        var own = entry.target.dataset.delay;
        entry.target.style.transitionDelay = (own !== undefined ? own : n++ * 70) + 'ms';
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    items.forEach(function (i) { io.observe(i); });
  }

  // Funkce jako orbita: 13 kategorií obíhá jádro, klik otevře kartu s funkcemi. Bez JS zůstane seznam.
  var ORBIT_ICONS = [
    'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 6v6l4 2',
    'M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 4 3 3 3 0 0 0 3-2V5a3 3 0 0 0-3-2zM15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-4 3 3 3 0 0 1-3-2',
    'M3 3h18v18H3zM9 3v18M15 3v18',
    'M3 5h18v14H3zM3 7l9 6 9-6',
    'M4 20V10M10 20V4M16 20v-7M22 20H2',
    'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
    'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
    'M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5',
    'M4 17l6-5-6-5M12 19h8'
  ];
  var STATE_NAMES = { h: 'Hotové', t: 'V testu', v: 'Vypnuté' };
  function initVse() {
    var box = document.querySelector('[data-vse]');
    var legend = document.querySelector('[data-legend]');
    if (!box || !legend) return;
    function html(tag, cls, parent, text) {
      var node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    }
    function stateOf(li) {
      var st = li.querySelector('.st');
      return st.classList.contains('st-h') ? 'h' : (st.classList.contains('st-t') ? 't' : 'v');
    }

    var groups = Array.prototype.slice.call(box.querySelectorAll('.fg'));
    var orb = html('div', 'orb');
    var stage = html('div', 'orb-stage', orb);
    var sys = html('div', 'orb-sys', stage);
    var ring = html('div', 'orb-ring', sys);
    var core = html('div', 'orb-core', sys);
    core.setAttribute('aria-hidden', 'true');
    html('span', 'orb-ping', core);
    html('span', 'orb-ping orb-ping2', core);
    var coreMark = el('svg', { viewBox: '3 5 40 34', 'aria-hidden': 'true', focusable: 'false' }, core);
    el('path', { d: 'M3 39V7l9-2 11 17L34 5l9 2v32H32V23L23 36l-9-13v16H3Z' }, coreMark);
    var list = html('ul', 'orb-nodes', sys);
    list.setAttribute('aria-label', 'Kategorie funkcí');
    var cap = html('p', 'orb-cap', orb);
    cap.setAttribute('aria-hidden', 'true');
    var card = html('div', 'orb-card', orb);
    card.tabIndex = 0;
    card.setAttribute('role', 'region');
    card.hidden = true;
    var cardTop = html('div', 'orb-card-top', card);
    var cardStates = html('div', 'orb-states', cardTop);
    var close = html('button', 'orb-close', cardTop);
    close.type = 'button';
    close.setAttribute('aria-label', 'Zavřít kartu');
    var closeIc = el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, close);
    el('path', { d: 'M6 6l12 12M18 6L6 18' }, closeIc);
    var live = html('p', 'vh', orb);
    live.setAttribute('aria-live', 'polite');

    var nodes = groups.map(function (fg, i) {
      var li = html('li', 'orb-item', list);
      var button = html('button', 'orb-node', li);
      button.type = 'button';
      var dot = html('span', 'orb-dot', button);
      var ic = el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, dot);
      el('path', { d: ORBIT_ICONS[i % ORBIT_ICONS.length] }, ic);
      var name = fg.querySelector('h3').textContent;
      var label = html('span', 'orb-label', button, name);
      fg.id = 'vse-g' + (i + 1);
      button.setAttribute('aria-controls', fg.id);
      card.appendChild(fg);
      fg.hidden = true;
      return {
        li: li, button: button, dot: dot, label: label, fg: fg, name: name, count: 0,
        items: Array.prototype.slice.call(fg.querySelectorAll('.fc')).map(function (it) {
          return { li: it, state: stateOf(it) };
        })
      };
    });
    box.textContent = '';
    box.appendChild(orb);

    var total = 0;
    var tally = { h: 0, t: 0, v: 0 };
    nodes.forEach(function (n) { n.items.forEach(function (it) { total++; tally[it.state]++; }); });

    // Položky legendy se stanou filtrem, přidá se k nim Vše. Počty jdou přímo z obsahu.
    var filters = {};
    var allLi = html('li');
    allLi.dataset.state = 'all';
    var allNum = html('span', 'num', allLi, String(total));
    allNum.setAttribute('aria-hidden', 'true');
    var allTx = html('span', 'legend-tx', allLi);
    html('span', 'legend-all', allTx, 'Vše');
    html('span', 'legend-def', allTx, 'všechny funkce');
    legend.insertBefore(allLi, legend.firstChild);
    Array.prototype.slice.call(legend.children).forEach(function (li) {
      var state = li.dataset.state;
      var button = html('button', 'flt');
      button.type = 'button';
      while (li.firstChild) button.appendChild(li.firstChild);
      li.appendChild(button);
      if (state !== 'all') button.querySelector('.num').textContent = String(tally[state]);
      button.setAttribute('aria-label', button.textContent.replace(/^\d+/, '').replace(/\s+/g, ' ').trim() + ', počet ' + button.querySelector('.num').textContent);
      filters[state] = button;
      button.addEventListener('click', function () { setFilter(state); });
    });
    legend.setAttribute('role', 'group');
    legend.setAttribute('aria-label', 'Filtr podle stavu');
    legend.dataset.ready = '1';

    var filter = 'all';
    var active = -1;
    var angle = 0;
    var tween = null;
    var radius = 200;
    var compact = false;
    var focusHold = false;
    var capIndex = -1;
    var COUNT = nodes.length;

    function place() {
      var front = 0;
      var best = -2;
      nodes.forEach(function (n, i) {
        var rad = ((i / COUNT) * 360 + angle) % 360 * Math.PI / 180;
        var x = radius * Math.cos(rad);
        var y = radius * Math.sin(rad);
        var sin = Math.sin(rad);
        var opacity = clamp(0.4 + 0.6 * ((1 + sin) / 2), 0.4, 1);
        if (sin > best && n.count) { best = sin; front = i; }
        n.li.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px)';
        n.li.style.zIndex = i === active ? '200' : String(Math.round(100 + 50 * Math.cos(rad)));
        // Popisek drží čitelnost i na zadní straně dráhy, plný vzorec platí pro kolečko.
        n.dot.style.opacity = i === active ? '1' : String(n.count ? opacity : opacity * 0.45);
        n.label.style.opacity = i === active ? '1' : String(n.count ? Math.max(opacity, 0.72) : 0.72);
      });
      if (!compact) return;
      var show = active >= 0 ? active : front;
      if (show !== capIndex) {
        if (nodes[capIndex]) nodes[capIndex].li.classList.remove('front');
        capIndex = show;
        nodes[show].li.classList.add('front');
        cap.textContent = nodes[show].name;
      }
    }
    function layout() {
      var width = orb.clientWidth;
      if (!width) return;
      var next = width < 600;
      if (next !== compact) {
        compact = next;
        orb.classList.toggle('compact', compact);
        if (!compact) { capIndex = -1; nodes.forEach(function (n) { n.li.classList.remove('front'); }); }
      }
      var height = stage.clientHeight;
      var cy = compact ? height / 2 : height / 2 - 14;
      radius = compact ? width / 2 - 34 : Math.min(width / 2 - 66, height / 2 - 76);
      sys.style.top = cy + 'px';
      ring.style.width = ring.style.height = (radius * 2) + 'px';
      if (compact) {
        card.style.top = '';
        card.style.maxHeight = '';
      } else {
        var top = cy - radius + 84;
        card.style.top = top + 'px';
        card.style.maxHeight = (height - top - 14) + 'px';
      }
      place();
    }
    function fillCard(n) {
      cardStates.textContent = '';
      ['h', 't', 'v'].forEach(function (k) {
        var count = n.items.filter(function (it) { return it.state === k; }).length;
        if (!count) return;
        var wrap = html('span', 'orb-state', cardStates);
        html('span', 'st st-' + k, wrap, STATE_NAMES[k]);
        html('span', 'orb-state-n', wrap, String(count));
      });
      card.setAttribute('aria-label', n.name);
    }
    function render(announce) {
      var shown = 0;
      Object.keys(filters).forEach(function (k) { filters[k].setAttribute('aria-pressed', String(k === filter)); });
      nodes.forEach(function (n, i) {
        n.count = 0;
        n.items.forEach(function (it) {
          var on = filter === 'all' || it.state === filter;
          it.li.hidden = !on;
          if (on) n.count++;
        });
        shown += n.count;
        n.button.disabled = n.count === 0;
        n.button.setAttribute('aria-label', n.name + ', funkcí ' + n.count);
        n.button.setAttribute('aria-expanded', String(i === active));
        n.li.classList.toggle('on', i === active);
        n.fg.hidden = i !== active;
      });
      card.hidden = active < 0;
      orb.classList.toggle('open', active >= 0);
      if (active >= 0) fillCard(nodes[active]);
      if (announce) live.textContent = 'Zobrazeno ' + (active >= 0 ? nodes[active].count : shown) + ' z ' + total;
      place();
    }
    function openNode(i, byKeyboard) {
      active = i;
      var to = 270 - (i / COUNT) * 360;
      if (motionOn()) {
        var diff = ((to - angle) % 360 + 540) % 360 - 180;
        tween = { from: angle, to: angle + diff, t: 0 };
      } else {
        angle = to;
        tween = null;
      }
      render(true);
      card.scrollTop = 0;
      if (byKeyboard) card.focus({ preventScroll: true });
      if (compact && card.getBoundingClientRect().bottom > window.innerHeight) card.scrollIntoView({ block: 'nearest' });
    }
    function closeCard(focusBack) {
      var was = active;
      active = -1;
      tween = null;
      render(true);
      if (focusBack && nodes[was]) nodes[was].button.focus();
    }
    function setFilter(next) {
      filter = next;
      if (active >= 0 && nodes[active].items.every(function (it) { return next !== 'all' && it.state !== next; })) active = -1;
      render(true);
    }

    nodes.forEach(function (n, i) {
      n.button.addEventListener('click', function (event) {
        if (active === i) closeCard(event.detail === 0);
        else openNode(i, event.detail === 0);
      });
      n.button.addEventListener('focus', function () {
        focusHold = n.button.matches(':focus-visible');
      });
      n.button.addEventListener('blur', function () { focusHold = false; });
    });
    close.addEventListener('click', function () { closeCard(true); });
    orb.addEventListener('click', function (event) {
      if (active >= 0 && !event.target.closest('.orb-node') && !event.target.closest('.orb-card')) closeCard(false);
    });
    orb.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && active >= 0) { event.preventDefault(); closeCard(true); }
    });

    render(false);
    box.classList.add('ready');
    layout();
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(orb);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    window.addEventListener('load', layout);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        orb.classList.toggle('in-view', entries[entries.length - 1].isIntersecting);
      }).observe(orb);
    } else {
      orb.classList.add('in-view');
    }
    register(orb, {
      tick: function (dt) {
        if (tween) {
          tween.t = Math.min(1, tween.t + dt / 0.7);
          angle = tween.from + (tween.to - tween.from) * ease(tween.t);
          if (tween.t === 1) { angle = tween.to; tween = null; }
          place();
        } else if (active < 0 && !focusHold) {
          // 0,3° po 50 ms jako v předloze, jen plynule po snímcích.
          angle = (angle + 6 * dt) % 360;
          place();
        }
      },
      still: function () {
        if (tween) { angle = tween.to; tween = null; }
        place();
      }
    });
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
      session.set('melaris-motion', userPaused ? 'off' : 'on');
      syncMotion();
    });
    if (reduced.addEventListener) reduced.addEventListener('change', syncMotion);
  }

  // Jedna chyba, třeba starý main.js z cache s novým HTML, nesmí zastavit zbytek stránky.
  [initTheme, initMotionToggle, initReveal, initVse, initHero, initFlow, initHub, initGates, initUiPanel].forEach(function (init) {
    try { init(); } catch (error) { if (window.console) console.error(error); }
  });
  syncMotion();
})();
