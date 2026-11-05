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
    function run(row, frames, done) {
      if (row.anim) row.anim.cancel();
      row.anim = row.fig.animate(frames, { duration: 350, easing: EASE });
      row.anim.onfinish = function () { row.anim = null; if (done) done(); };
    }
    function leave(row) {
      row.fig.classList.add('leave');
      var height = row.fig.offsetHeight;
      run(row, wide.matches
        ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(.98)' }]
        : [{ height: height + 'px', marginBottom: '16px', opacity: 1 }, { height: 0, marginBottom: 0, opacity: 0 }],
      function () { row.fig.classList.remove('leave'); });
    }
    function enter(row) {
      var height = row.fig.offsetHeight;
      run(row, wide.matches
        ? [{ opacity: 0, transform: 'translateY(12px) scale(.98)' }, { opacity: 1, transform: 'none' }]
        : [{ height: 0, marginBottom: 0, opacity: 0 }, { height: height + 'px', marginBottom: '16px', opacity: 1 }]);
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
    var wait = 0;
    var holdUntil = 0;
    var DWELL = 2.8;

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
        entry.target.style.transitionDelay = (n++ * 70) + 'ms';
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    items.forEach(function (i) { io.observe(i); });
  }

  // Funkce: filtr podle stavu a kategorie. Bez JS zůstane vidět všechno.
  function initVse() {
    var box = document.querySelector('[data-vse]');
    var legend = document.querySelector('[data-legend]');
    if (!box || !legend) return;
    var phone = window.matchMedia('(max-width:719px)');
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
    function catRow(name, parent) {
      var li = html('li', '', parent);
      var button = html('button', 'cat', li);
      button.type = 'button';
      var num = html('span', 'num', button);
      num.setAttribute('aria-hidden', 'true');
      html('span', 'cat-name', button, name);
      return { li: li, button: button, num: num };
    }

    var groups = Array.prototype.slice.call(box.querySelectorAll('.fg'));
    var cats = html('ul', 'cats');
    cats.setAttribute('aria-label', 'Kategorie funkcí');
    var all = catRow('Všechny kategorie', cats);
    var rows = groups.map(function (fg, i) {
      var row = catRow(fg.querySelector('h3').textContent, cats);
      row.fg = fg;
      fg.id = 'vse-g' + (i + 1);
      row.button.setAttribute('aria-controls', fg.id);
      row.items = Array.prototype.slice.call(fg.querySelectorAll('.fc')).map(function (li) {
        return { li: li, state: stateOf(li) };
      });
      return row;
    });
    var panel = html('div', 'vse-panel');
    var live = html('p', 'vh');
    live.setAttribute('aria-live', 'polite');
    box.textContent = '';
    box.appendChild(cats);
    box.appendChild(panel);
    box.appendChild(live);

    var total = 0;
    var tally = { h: 0, t: 0, v: 0 };
    rows.forEach(function (row) { row.items.forEach(function (it) { total++; tally[it.state]++; }); });

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
    var cat = 0;
    var before = 0;

    function matches(it) { return filter === 'all' || it.state === filter; }
    function render(announce) {
      var shown = 0;
      Object.keys(filters).forEach(function (k) { filters[k].setAttribute('aria-pressed', String(k === filter)); });
      rows.forEach(function (row, i) {
        var count = 0;
        row.items.forEach(function (it) {
          var on = matches(it);
          it.li.hidden = !on;
          if (on) count++;
        });
        var visible = count > 0 && (cat === 'all' || cat === i);
        row.num.textContent = String(count);
        row.button.disabled = count === 0;
        row.button.setAttribute('aria-expanded', String(visible));
        row.button.setAttribute('aria-current', String(cat === i));
        row.li.classList.toggle('on', visible);
        row.fg.hidden = !visible;
        if (visible) shown += count;
      });
      all.num.textContent = String(filter === 'all' ? total : tally[filter]);
      all.button.setAttribute('aria-current', String(cat === 'all'));
      all.li.classList.toggle('on', cat === 'all');
      if (announce) live.textContent = 'Zobrazeno ' + shown + ' z ' + total;
    }
    function setFilter(next) {
      // Filtr hledá napříč kategoriemi; Vše vrátí předchozí kategorii.
      if (next !== 'all' && filter === 'all') before = cat;
      if (next !== 'all') cat = 'all';
      else if (filter !== 'all') cat = before;
      filter = next;
      render(true);
    }
    function setCat(next, row) {
      cat = next;
      render(true);
      var anchor = phone.matches ? row.li : panel;
      if (anchor.getBoundingClientRect().top < 0) anchor.scrollIntoView({ block: 'start' });
    }
    all.button.addEventListener('click', function () { setCat('all', all); });
    rows.forEach(function (row, i) {
      row.button.addEventListener('click', function () { setCat(i, row); });
    });
    // Na telefonu se obsah rozbalí v rámečku kategorie, jinak je v panelu vedle.
    function place() {
      rows.forEach(function (row) { (phone.matches ? row.li : panel).appendChild(row.fg); });
    }
    place();
    if (phone.addEventListener) phone.addEventListener('change', place);
    render(false);
    box.classList.add('ready');
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
  initVse();
  initReveal();
  initHero();
  initFlow();
  initHub();
  initGates();
  initUiPanel();
  syncMotion();
})();
