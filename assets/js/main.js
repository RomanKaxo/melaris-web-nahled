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

  // Schéma 3: cesta úlohy šesti kroky. Závora u člověka se otevře, až když úloha projde.
  function initGates() {
    var fig = document.getElementById('gates');
    if (!fig) return;
    var HUMAN = 3;
    var DWELL = 2;
    var list = fig.querySelector('[data-steps]');
    var steps = Array.prototype.slice.call(list.children);
    function html(tag, cls, parent, text) {
      var node = document.createElement(tag);
      node.className = cls;
      if (text !== undefined) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    }
    var road = html('div', 'gate-road');
    var line = html('div', 'gate-line', road);
    var fill = html('div', 'gate-fill', line);
    var track = html('div', 'gate-track', road);
    var token = html('span', 'gate-token', track);
    track.setAttribute('aria-hidden', 'true');
    html('span', 'gate-post', road).setAttribute('aria-hidden', 'true');
    html('span', 'gate-note', road, 'člověk rozhoduje').setAttribute('aria-hidden', 'true');
    var group = html('div', 'gate-stops', road);
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Kroky běhu');
    var stops = steps.map(function (step, i) {
      var button = html('button', 'gate-stop', group);
      button.type = 'button';
      html('span', 'num', button, String(i + 1)).setAttribute('aria-hidden', 'true');
      html('b', '', button, step.querySelector('h4').textContent);
      html('span', 'gate-short', button, step.querySelector('.gate-do').textContent);
      button.setAttribute('aria-controls', 'gate-s' + (i + 1));
      step.id = 'gate-s' + (i + 1);
      button.addEventListener('click', function () { interact(i); });
      button.addEventListener('pointerenter', function (event) { if (event.pointerType === 'mouse') interact(i); });
      button.addEventListener('focus', function () { if (button.matches(':focus-visible')) interact(i); });
      return button;
    });
    fig.insertBefore(road, list);

    var pos = 0;
    var target = 0;
    var wait = 1.4;
    var holdUntil = 0;

    function draw() {
      var p = pos / (steps.length - 1);
      fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      token.style.setProperty('--p', p.toFixed(4));
      stops.forEach(function (stop, i) { stop.classList.toggle('done', i <= pos + 0.02); });
      road.classList.toggle('pass', pos > HUMAN + 0.02);
    }
    function show(index, announce) {
      var changed = index !== target;
      target = index;
      list.setAttribute('aria-live', announce ? 'polite' : 'off');
      steps.forEach(function (step, i) { step.hidden = i !== index; });
      stops.forEach(function (stop, i) { stop.setAttribute('aria-pressed', String(i === index)); });
      road.classList.toggle('at-human', index === HUMAN);
      if (changed && motionOn() && steps[index].animate) {
        steps[index].animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    }
    function interact(index) {
      holdUntil = performance.now() + 9000;
      wait = 0;
      show(index, true);
      if (!motionOn()) { pos = index; draw(); }
    }
    group.addEventListener('keydown', function (event) {
      var at = stops.indexOf(document.activeElement);
      if (at < 0) return;
      var map = { ArrowRight: Math.min(at + 1, stops.length - 1), ArrowLeft: Math.max(at - 1, 0), ArrowDown: Math.min(at + 1, stops.length - 1), ArrowUp: Math.max(at - 1, 0), Home: 0, End: stops.length - 1 };
      if (map[event.key] === undefined) return;
      event.preventDefault();
      stops[map[event.key]].focus();
      interact(map[event.key]);
    });
    root.classList.add('gates-ready');
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
          // U člověka úloha počká déle: právě tady se běh zastavuje.
          if (wait >= (target === HUMAN ? DWELL * 1.6 : DWELL)) {
            wait = 0;
            show(target === steps.length - 1 ? 0 : target + 1, false);
          }
        }
      },
      still: function () { pos = target; draw(); }
    });
  }

  // Zobrazení při vjezdu do okna, po částech sekce.
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.rv'));
    root.classList.add('rv-on');
    if (!('IntersectionObserver' in window)) { items.forEach(function (i) { i.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var own = entry.target.dataset.delay;
        var delay = own !== undefined ? Number(own) : Math.min(n++, 5) * 70;
        var target = entry.target;
        target.style.transitionDelay = delay + 'ms';
        target.classList.add('in');
        io.unobserve(target);
        // Po vjezdu reaguje prvek na najetí hned, bez zpoždění vjezdu.
        setTimeout(function () { target.style.transitionDelay = ''; target.classList.add('rv-done'); }, delay + 520);
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
  var STATE_KEYS = ['h', 't', 'v'];
  function funkci(n) { return n + (n >= 2 && n <= 4 ? ' funkce' : (n === 1 ? ' funkce' : ' funkcí')); }
  // Prstenec s poměrem stavů: stejný zápis pro kuličky i jádro.
  function ringOf(parent, counts) {
    var svg = el('svg', { class: 'orb-seg', viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' }, parent);
    var total = counts.h + counts.t + counts.v;
    var used = STATE_KEYS.filter(function (k) { return counts[k]; });
    var gap = used.length > 1 ? 2 : 0;
    var off = 0;
    used.forEach(function (k) {
      var share = counts[k] / total * 100;
      var len = share - gap;
      el('circle', {
        class: 'seg seg-' + k, cx: 50, cy: 50, r: 46, pathLength: 100, transform: 'rotate(-90 50 50)',
        'stroke-dasharray': len + ' ' + (100 - len), 'stroke-dashoffset': -(off + gap / 2)
      }, svg);
      off += share;
    });
    return svg;
  }
  // Funkce jako orbita: kuličky obíhají jádro, vybraná přeletí do bločku. Bez JS zůstane seznam.
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
    function tallyOf(items) {
      var out = { h: 0, t: 0, v: 0 };
      items.forEach(function (it) { out[it.state]++; });
      return out;
    }

    var groups = Array.prototype.slice.call(box.querySelectorAll('.fg'));
    var orb = html('div', 'orb');

    // Přepínač stavu s počty.
    var sw = html('div', 'orb-sw', orb);
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', 'Filtr podle stavu');

    var stage = html('div', 'orb-stage', orb);
    var sys = html('div', 'orb-sys', stage);
    var track = html('div', 'orb-track', sys);
    var dotsSvg = el('svg', { class: 'orb-dots', role: 'group', 'aria-label': 'Všechny funkce podle stavu' }, sys);
    var dotsG = el('g', {}, dotsSvg);
    var gapEl = html('div', 'orb-gap', sys);
    gapEl.setAttribute('aria-hidden', 'true');
    var core = html('div', 'orb-core', sys);
    html('span', 'orb-ping', core);
    html('span', 'orb-ping orb-ping2', core);
    var coreMark = el('svg', { class: 'orb-mark', viewBox: '3 5 40 34', 'aria-hidden': 'true', focusable: 'false' }, core);
    el('use', { href: '#m-mark' }, coreMark);
    var coreText = html('p', 'orb-core-n', core);
    var list = html('ul', 'orb-nodes', sys);
    list.setAttribute('aria-label', 'Kategorie funkcí');
    var tip = html('div', 'orb-tip', stage);
    tip.hidden = true;

    // Výběr pro telefon: názvy všech kategorií na jednom místě.
    var pick = html('label', 'orb-pick', orb);
    html('span', 'vh', pick, 'Kategorie');
    var select = html('select', '', pick);

    var card = html('div', 'orb-card', orb);
    var head = html('div', 'orb-head', card);
    var slot = html('span', 'orb-slot', head);
    var headTx = html('div', 'orb-head-tx', head);
    var title = html('p', 'orb-title', headTx);
    title.setAttribute('aria-hidden', 'true');
    var sub = html('p', 'orb-sub', headTx);
    var bar = html('div', 'orb-bar', card);
    bar.setAttribute('aria-hidden', 'true');
    var states = html('div', 'orb-states', card);
    var holder = html('div', 'orb-list', card);
    var live = html('p', 'vh', orb);
    live.setAttribute('aria-live', 'polite');

    var nodes = groups.map(function (fg, i) {
      var items = Array.prototype.slice.call(fg.querySelectorAll('.fc')).map(function (it) {
        return { li: it, state: stateOf(it), name: it.querySelector('h4').textContent };
      });
      var counts = tallyOf(items);
      var li = html('li', 'orb-item', list);
      li.style.setProperty('--c', String(items.length));
      var button = html('button', 'orb-node', li);
      button.type = 'button';
      ringOf(button, counts);
      var dot = html('span', 'orb-dot', button);
      var ic = el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, dot);
      el('path', { d: ORBIT_ICONS[i % ORBIT_ICONS.length] }, ic);
      var name = fg.querySelector('h3').textContent;
      var label = html('span', 'orb-label', button, name);
      fg.id = 'vse-g' + (i + 1);
      button.setAttribute('aria-controls', fg.id);
      holder.appendChild(fg);
      var option = html('option', '', select, name);
      option.value = String(i);
      return { li: li, button: button, label: label, fg: fg, name: name, items: items, counts: counts, count: items.length, option: option, x: 0, y: 0, s: 1, fly: null, size: 44 };
    });
    box.textContent = '';
    box.appendChild(orb);
    // Vysvětlení stavů zůstává pod celou skladbou.
    box.parentNode.appendChild(legend);
    legend.dataset.ready = '1';

    var allItems = [];
    nodes.forEach(function (n) { n.items.forEach(function (it) { allItems.push(it); }); });
    var total = allItems.length;
    var tally = tallyOf(allItems);
    ringOf(core, tally);

    // Segmenty přepínače.
    var filters = {};
    ['all', 'h', 't', 'v'].forEach(function (k) {
      var button = html('button', 'flt', sw);
      button.type = 'button';
      if (k !== 'all') html('span', 'sw-dot sw-' + k, button);
      html('span', '', button, k === 'all' ? 'Vše' : STATE_NAMES[k]);
      html('b', '', button, String(k === 'all' ? total : tally[k]));
      filters[k] = button;
      button.addEventListener('click', function () { setFilter(k); });
    });

    // 60 bodů na vnější dráze, po skupinách u své kategorie.
    var COUNT = nodes.length;
    var points = [];
    nodes.forEach(function (n, i) {
      n.items.forEach(function (it, j) {
        var g = el('g', { class: 'orb-pt s-' + it.state, role: 'img', tabindex: '-1', 'aria-label': it.name + ', ' + STATE_NAMES[it.state] }, dotsG);
        var pt = { g: g, node: i, offset: (j - (n.items.length - 1) / 2), it: it, hit: el('circle', { class: 'orb-hit' }, g), dot: el('circle', { class: 'orb-pd' }, g) };
        it.pt = pt;
        points.push(pt);
        g.addEventListener('pointerenter', function () { showTip(pt); });
        g.addEventListener('pointerleave', hideTip);
        g.addEventListener('focus', function () { showTip(pt); focusHold = true; });
        g.addEventListener('blur', function () { hideTip(); focusHold = false; });
        g.addEventListener('click', function () { choose(i); });
        it.li.addEventListener('pointerenter', function () { pt.g.classList.add('hot'); });
        it.li.addEventListener('pointerleave', function () { pt.g.classList.remove('hot'); });
      });
    });
    if (points[0]) points[0].g.setAttribute('tabindex', '0');
    dotsSvg.addEventListener('keydown', function (event) {
      var at = points.findIndex(function (p) { return p.g === document.activeElement; });
      if (at < 0) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(points[at].node); return; }
      var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      var next = (at + step + points.length) % points.length;
      points[at].g.setAttribute('tabindex', '-1');
      points[next].g.setAttribute('tabindex', '0');
      points[next].g.focus();
    });

    var filter = 'all';
    var active = 0;
    var angle = 0;
    var radius = 200;
    var outer = 280;
    var compact = false;
    var stacked = false;
    var focusHold = false;
    var hoverHold = false;
    var slotX = 0;
    var slotY = 0;
    var FLIGHT = 0.6;
    var widget = null;

    function animating() { return motionOn() && widget && widget.visible; }
    function orbitPos(i) {
      var rad = ((i / COUNT) * 360 + angle) * Math.PI / 180;
      return { x: radius * Math.cos(rad), y: radius * Math.sin(rad), sin: Math.sin(rad), cos: Math.cos(rad) };
    }
    function parkedScale(n) { return 64 / (n.size || 44); }
    function place() {
      nodes.forEach(function (n, i) {
        var o = orbitPos(i);
        var parked = i === active;
        if (n.fly) {
          var f = n.fly;
          var p = f.t < 0.5 ? 4 * f.t * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
          var ex = f.toSlot ? slotX : o.x;
          var ey = f.toSlot ? slotY : o.y;
          var es = f.toSlot ? parkedScale(n) : 1;
          // Oblouk: řídicí bod je kolmo na spojnici.
          var mx = (f.x + ex) / 2 - (ey - f.y) * 0.22;
          var my = (f.y + ey) / 2 + (ex - f.x) * 0.22;
          n.x = (1 - p) * (1 - p) * f.x + 2 * (1 - p) * p * mx + p * p * ex;
          n.y = (1 - p) * (1 - p) * f.y + 2 * (1 - p) * p * my + p * p * ey;
          n.s = f.s + (es - f.s) * p;
        } else if (parked) {
          n.x = slotX; n.y = slotY; n.s = parkedScale(n);
        } else {
          n.x = o.x; n.y = o.y; n.s = 1;
        }
        n.li.style.transform = 'translate(' + n.x.toFixed(2) + 'px,' + n.y.toFixed(2) + 'px) scale(' + n.s.toFixed(3) + ')';
        n.li.style.zIndex = parked || n.fly ? '200' : String(Math.round(100 + 50 * o.cos));
        var depth = clamp(0.72 + 0.28 * ((1 + o.sin) / 2), 0.72, 1);
        var matched = n.shown > 0;
        n.li.style.opacity = parked || n.fly ? '1' : String(matched ? depth : 0.3);
        n.label.style.opacity = parked || n.fly ? '0' : '';
      });
      var gap = orbitPos(active);
      gapEl.style.transform = 'translate(' + gap.x.toFixed(2) + 'px,' + gap.y.toFixed(2) + 'px)';
      dotsG.setAttribute('transform', 'rotate(' + angle.toFixed(3) + ')');
    }
    function layout() {
      var width = orb.clientWidth;
      if (!width) return;
      // Změna rozměru ukončí rozletěné kuličky: souřadnice letu už neplatí.
      nodes.forEach(function (n) { n.fly = null; });
      var nextStack = width < 900;
      if (nextStack !== stacked) { stacked = nextStack; orb.classList.toggle('orb-col', stacked); }
      var nextCompact = stage.clientWidth < 560;
      if (nextCompact !== compact) { compact = nextCompact; orb.classList.toggle('compact', compact); }
      var w = stage.clientWidth;
      stage.style.height = stacked ? Math.min(w, 680) + 'px' : '';
      var h = stage.clientHeight;
      var half = Math.min(w, h) / 2;
      outer = half - (compact ? 8 : 14);
      radius = outer * (compact ? 0.72 : 0.71);
      var sRect = stage.getBoundingClientRect();
      sys.style.left = (w / 2) + 'px';
      sys.style.top = (h / 2) + 'px';
      track.style.width = track.style.height = (radius * 2) + 'px';
      var size = (outer + 16) * 2;
      dotsSvg.setAttribute('viewBox', (-size / 2) + ' ' + (-size / 2) + ' ' + size + ' ' + size);
      dotsSvg.style.width = dotsSvg.style.height = size + 'px';
      dotsSvg.style.left = dotsSvg.style.top = (-size / 2) + 'px';
      var step = compact ? 3.4 : 3.5;
      points.forEach(function (pt) {
        var rad = ((pt.node / COUNT) * 360 + pt.offset * step) * Math.PI / 180;
        var x = (outer * Math.cos(rad)).toFixed(2);
        var y = (outer * Math.sin(rad)).toFixed(2);
        pt.hit.setAttribute('cx', x); pt.hit.setAttribute('cy', y); pt.hit.setAttribute('r', compact ? 8 : 9);
        pt.dot.setAttribute('cx', x); pt.dot.setAttribute('cy', y); pt.dot.setAttribute('r', compact ? 2.4 : 3);
      });
      nodes.forEach(function (n) { n.size = n.button.offsetWidth || 44; });
      var slRect = slot.getBoundingClientRect();
      slotX = slRect.left + slRect.width / 2 - sRect.left - w / 2;
      slotY = slRect.top + slRect.height / 2 - sRect.top - h / 2;
      gapEl.style.width = gapEl.style.height = nodes[active].size + 'px';
      gapEl.style.margin = (-nodes[active].size / 2) + 'px 0 0 ' + (-nodes[active].size / 2) + 'px';
      place();
    }
    function showTip(pt) {
      tip.textContent = '';
      html('b', '', tip, pt.it.name);
      html('span', '', tip, STATE_NAMES[pt.it.state]);
      tip.hidden = false;
      var rad = ((pt.node / COUNT) * 360 + pt.offset * (compact ? 3.4 : 3.5) + angle) * Math.PI / 180;
      var r = outer - 30;
      var w = stage.clientWidth;
      var h = stage.clientHeight;
      var tw = tip.offsetWidth;
      var th = tip.offsetHeight;
      tip.style.left = clamp(w / 2 + r * Math.cos(rad) - tw / 2, 4, Math.max(4, w - tw - 4)) + 'px';
      tip.style.top = clamp(h / 2 + r * Math.sin(rad) - th / 2, 4, Math.max(4, h - th - 4)) + 'px';
      pt.g.classList.add('hot');
      pt.it.li.classList.add('hot');
      hoverHold = true;
    }
    function hideTip() {
      tip.hidden = true;
      points.forEach(function (p) { p.g.classList.remove('hot'); p.it.li.classList.remove('hot'); });
      hoverHold = false;
    }
    function fillCard() {
      var n = nodes[active];
      title.textContent = n.name;
      sub.textContent = funkci(n.count);
      bar.textContent = '';
      states.textContent = '';
      STATE_KEYS.forEach(function (k) {
        if (!n.counts[k]) return;
        var part = html('span', 'bar-' + k, bar);
        part.style.flexGrow = String(n.counts[k]);
        if (animating() && part.animate) part.animate([{ transform: 'scaleX(0)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 480, delay: 120, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
        var wrap = html('span', 'orb-state', states);
        html('span', 'st st-' + k, wrap, STATE_NAMES[k]);
        html('b', '', wrap, String(n.counts[k]));
      });
    }
    function arrive() {
      if (!animating() || !nodes[active].fg.animate) return;
      nodes[active].items.filter(function (it) { return !it.li.hidden; }).slice(0, 6).forEach(function (it, i) {
        it.li.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 160 + i * 50, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      });
      head.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 320, delay: 180, easing: 'ease', fill: 'backwards' });
    }
    function render(announce) {
      var shown = 0;
      Object.keys(filters).forEach(function (k) { filters[k].setAttribute('aria-pressed', String(k === filter)); });
      orb.dataset.f = filter;
      nodes.forEach(function (n, i) {
        n.shown = 0;
        n.items.forEach(function (it) {
          var on = filter === 'all' || it.state === filter;
          it.li.hidden = !on;
          if (on) n.shown++;
        });
        shown += n.shown;
        n.button.disabled = n.shown === 0;
        n.option.disabled = n.shown === 0;
        n.option.textContent = n.name + ' (' + n.shown + ')';
        n.button.setAttribute('aria-label', n.name + ', ' + funkci(n.shown));
        n.button.setAttribute('aria-expanded', String(i === active));
        n.li.classList.toggle('parked', i === active);
        n.fg.classList.toggle('on', i === active);
      });
      select.value = String(active);
      coreText.textContent = funkci(shown);
      gapEl.style.width = gapEl.style.height = nodes[active].size + 'px';
      gapEl.style.margin = (-nodes[active].size / 2) + 'px 0 0 ' + (-nodes[active].size / 2) + 'px';
      fillCard();
      if (announce) live.textContent = nodes[active].name + ', zobrazeno ' + nodes[active].shown + ' z ' + total;
      place();
    }
    function startFly(n, toSlot) {
      n.fly = { x: n.x, y: n.y, s: n.s, t: 0, toSlot: toSlot };
    }
    function choose(i) {
      if (i === active || nodes[i].shown === 0) return;
      var prev = nodes[active];
      active = i;
      if (animating()) { startFly(prev, false); startFly(nodes[i], true); }
      render(true);
      arrive();
      if (stacked && head.getBoundingClientRect().bottom > window.innerHeight) head.scrollIntoView({ block: 'nearest' });
    }
    function setFilter(next) {
      filter = next;
      // Zaparkovaná kategorie bez shody: přeletí první, která shodu má.
      var keep = next === 'all' || nodes[active].items.some(function (it) { return it.state === next; });
      if (!keep) {
        var first = nodes.findIndex(function (n) { return n.items.some(function (it) { return it.state === next; }); });
        render(false);
        choose(first);
      } else {
        render(true);
        arrive();
      }
    }

    nodes.forEach(function (n, i) {
      n.button.addEventListener('click', function () { hoverHold = false; choose(i); });
      n.button.addEventListener('focus', function () { focusHold = n.button.matches(':focus-visible'); });
      n.button.addEventListener('blur', function () { focusHold = false; });
    });
    select.addEventListener('change', function () { choose(Number(select.value)); });
    stage.addEventListener('pointerover', function (event) {
      // Najetí na kuličku na dráze ji podrží, aby šla trefit; zaparkovaná v bločku orbitu nebrzdí.
      if (event.pointerType === 'mouse' && event.target.closest('.orb-node') && !event.target.closest('.parked')) hoverHold = true;
    });
    stage.addEventListener('pointerout', function (event) {
      if (event.pointerType === 'mouse' && event.target.closest('.orb-node')) hoverHold = false;
    });
    orb.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') hideTip();
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
    widget = {
      tick: function (dt) {
        var moving = false;
        nodes.forEach(function (n) {
          if (!n.fly) return;
          n.fly.t = Math.min(1, n.fly.t + dt / FLIGHT);
          moving = true;
          if (n.fly.t === 1) n.fly = null;
        });
        if (!focusHold && !hoverHold) {
          // 0,3° po 50 ms jako v předloze, jen plynule po snímcích.
          angle = (angle + 6 * dt) % 360;
          moving = true;
        }
        if (moving) place();
      },
      still: function () {
        nodes.forEach(function (n) { n.fly = null; });
        place();
      }
    };
    register(orb, widget);
  }

  // Dlouhé doplňky jsou na telefonu sbalené, jinak otevřené. Bez JS zůstávají otevřené.
  function initCollapse() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-collapse]'));
    var phone = window.matchMedia('(max-width:719px)');
    var rows = Array.prototype.slice.call(document.querySelectorAll('.steps,.adv'));
    function apply() {
      items.forEach(function (item) { item.open = !phone.matches; });
      // Vodorovná řada na telefonu musí jít posouvat i klávesnicí.
      rows.forEach(function (row) {
        if (phone.matches) row.setAttribute('tabindex', '0');
        else row.removeAttribute('tabindex');
      });
    }
    apply();
    if (phone.addEventListener) phone.addEventListener('change', apply);
  }

  // Jméno: každé písmeno ukáže své odůvodnění a jeho hranice. Bez JS jsou vidět všechna.
  function initName() {
    var box = document.querySelector('[data-name]');
    if (!box) return;
    var items = Array.prototype.slice.call(box.querySelectorAll('.nm'));
    var row = document.createElement('div');
    row.className = 'nm-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Písmena jména Melaris');
    var stage = document.createElement('div');
    stage.className = 'nm-stage';
    var live = document.createElement('p');
    live.className = 'vh';
    live.setAttribute('aria-live', 'polite');
    var buttons = items.map(function (item, i) {
      var button = document.createElement('button');
      var letter = document.createElement('b');
      var word = document.createElement('span');
      var name = item.querySelector('.nm-t').textContent.trim();
      letter.textContent = name.charAt(0);
      word.textContent = name.slice(2);
      button.type = 'button';
      button.className = 'nm-btn';
      button.setAttribute('aria-controls', item.id);
      button.appendChild(letter);
      button.appendChild(word);
      button.addEventListener('click', function () { show(i, true); });
      row.appendChild(button);
      stage.appendChild(item);
      return button;
    });
    function show(index, animate) {
      items.forEach(function (item, i) {
        var on = i === index;
        item.classList.toggle('on', on);
        buttons[i].setAttribute('aria-pressed', String(on));
        if (on && animate) {
          live.textContent = item.querySelector('.nm-t').textContent.trim();
          if (motionOn() && item.animate) item.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
        }
      });
    }
    box.appendChild(row);
    box.appendChild(stage);
    box.appendChild(live);
    show(0, false);
  }

  // Mel: mrká, rozhlíží se, sleduje kurzor a po kliknutí poskočí.
  function initMel() {
    var button = document.getElementById('mel-btn');
    var svg = document.getElementById('mel-avatar');
    if (!button || !svg) return;
    var section = button.closest('.mel');
    var lids = Array.prototype.slice.call(svg.querySelectorAll('.vk'));
    var pointer = { x: 0, y: 0, t: -1e9 };
    var gx = 0;
    var gy = 0;
    var tx = 0;
    var ty = 0;
    var nextBlink = 0;
    var nextLook = 0;
    var lookEnd = 0;
    var hop = 0;
    function rand(a, b) { return a + Math.random() * (b - a); }
    function blink() {
      var ky = parseFloat(getComputedStyle(svg).getPropertyValue('--ky')) || 0;
      lids.forEach(function (lid) {
        if (lid.animate) lid.animate([{ transform: 'scaleY(' + ky + ')' }, { transform: 'scaleY(1)', offset: 0.42 }, { transform: 'scaleY(1)', offset: 0.55 }, { transform: 'scaleY(' + ky + ')' }], { duration: 170, easing: 'ease-in-out' });
      });
    }
    window.addEventListener('pointermove', function (event) {
      pointer.x = event.clientX; pointer.y = event.clientY; pointer.t = performance.now();
    }, { passive: true });
    button.addEventListener('pointerenter', function () { svg.classList.add('hov'); });
    button.addEventListener('pointerleave', function () { svg.classList.remove('hov'); });
    button.addEventListener('click', function () {
      svg.dataset.s = 'done';
      clearTimeout(hop);
      hop = setTimeout(function () { svg.dataset.s = 'idle'; }, 1250);
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        section.classList.toggle('in-view', entries[entries.length - 1].isIntersecting);
      }).observe(section);
    } else {
      section.classList.add('in-view');
    }
    function apply() {
      var moving = Math.abs(gx) > 0.02 || Math.abs(gy) > 0.02;
      svg.classList.toggle('sled', moving);
      if (moving) {
        svg.style.setProperty('--gx', gx.toFixed(2));
        svg.style.setProperty('--gy', gy.toFixed(2));
      } else {
        svg.style.removeProperty('--gx');
        svg.style.removeProperty('--gy');
      }
    }
    register(section, {
      tick: function (dt, now) {
        if (svg.dataset.s !== 'idle') return;
        if (!nextBlink) { nextBlink = now + rand(1200, 4000); nextLook = now + rand(2500, 6000); }
        if (now > nextBlink) { blink(); nextBlink = now + rand(2100, 7400); }
        var near = now - pointer.t < 2200;
        if (near) {
          var r = svg.getBoundingClientRect();
          var dx = pointer.x - (r.left + r.width / 2);
          var dy = pointer.y - (r.top + r.height * 0.46);
          var d = Math.sqrt(dx * dx + dy * dy) || 1;
          var pull = Math.min(1, d / (r.width * 0.9));
          tx = dx / d * 3 * pull;
          ty = dy / d * 2.8 * pull;
        } else if (now > nextLook) {
          tx = rand(-2.2, 2.2);
          ty = rand(-1.4, 1.4);
          lookEnd = now + rand(700, 1500);
          nextLook = now + rand(3500, 8000);
        } else if (now > lookEnd) {
          tx = 0;
          ty = 0;
        }
        var k = 1 - Math.pow(near ? 0.84 : 0.955, dt * 60);
        gx += (tx - gx) * k;
        gy += (ty - gy) * k;
        apply();
      },
      still: function () { gx = gy = tx = ty = 0; apply(); }
    });
  }

  // Hlavička: aktivní sekce při posunu, jemná linka a menu na telefonu.
  function initBar() {
    var bar = document.querySelector('.bar');
    if (!bar) return;
    var links = Array.prototype.slice.call(bar.querySelectorAll('.bar-nav a'));
    var bySection = { proc: 'proc', jak: 'jak', funkce: 'funkce', ukazky: 'funkce', vse: 'funkce', srovnani: 'srovnani', vyhody: 'srovnani', stav: 'stav', otazky: 'otazky' };
    function mark(id) {
      links.forEach(function (a) {
        if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }
    if ('IntersectionObserver' in window) {
      var seen = {};
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
        var hit = Array.prototype.slice.call(document.querySelectorAll('main > section[id]')).filter(function (s) { return seen[s.id]; })[0];
        mark(hit ? bySection[hit.id] || '' : '');
      }, { rootMargin: '-40% 0px -55% 0px' });
      Array.prototype.slice.call(document.querySelectorAll('main > section[id]')).forEach(function (s) { spy.observe(s); });
    }
    var prog = bar.querySelector('.bar-prog');
    var queued = false;
    function onScroll() {
      queued = false;
      bar.classList.toggle('scrolled', window.scrollY > 8);
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (prog) prog.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0).toFixed(4) + ')';
    }
    window.addEventListener('scroll', function () {
      if (!queued) { queued = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();

    var toggle = document.getElementById('menu-toggle');
    var menu = document.getElementById('bar-menu');
    if (!toggle || !menu) return;
    var phone = window.matchMedia('(max-width:899px)');
    function isOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }
    function setOpen(open, refocus) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
      menu.classList.toggle('open', open);
      if (open) { var first = menu.querySelector('a'); if (first) first.focus(); }
      else if (refocus) toggle.focus();
    }
    toggle.addEventListener('click', function () { setOpen(!isOpen(), true); });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false, false);
    });
    document.addEventListener('click', function (event) {
      if (isOpen() && !bar.contains(event.target)) setOpen(false, false);
    });
    bar.addEventListener('keydown', function (event) {
      if (!isOpen()) return;
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false, true); return; }
      if (event.key !== 'Tab') return;
      // Fokus zůstává v menu a na tlačítku, které ho zavírá.
      var items = Array.prototype.slice.call(menu.querySelectorAll('a,button')).filter(function (el) { return !el.disabled; }).concat(toggle);
      var at = items.indexOf(document.activeElement);
      var next = (at + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      event.preventDefault();
      items[next].focus();
    });
    if (phone.addEventListener) phone.addEventListener('change', function () { if (isOpen()) setOpen(false, false); });
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
  [initBar, initTheme, initMotionToggle, initReveal, initVse, initHero, initFlow, initHub, initGates, initUiPanel, initMel, initName, initCollapse].forEach(function (init) {
    try { init(); } catch (error) { if (window.console) console.error(error); }
  });
  syncMotion();
})();
