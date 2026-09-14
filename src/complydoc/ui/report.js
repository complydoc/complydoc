/* Progressive enhancement only: with scripting off, every document and every
   table row is already on the page. This adds a filter and pagination for runs
   large enough that scrolling stops working. */
(function () {
  "use strict";


  function providerFilter() {
    var bar = document.getElementById("providers");
    if (!bar) return;
    var buttons = Array.prototype.slice.call(bar.querySelectorAll("button"));
    var charts = Array.prototype.slice.call(document.querySelectorAll("svg.chart"));
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var DURATION = still ? 0 : 260;

    // The viewBox is an attribute, so CSS cannot transition it. Without tweening
    // it the chart snapped to its new height while the bars were still sliding,
    // which read as a jump rather than a filter.
    function resize(svg, to) {
      var box = svg.getAttribute("viewBox").split(" ");
      var from = parseFloat(box[3]);
      var axis = svg.querySelector("line.axis");
      if (svg._tween) cancelAnimationFrame(svg._tween);

      function paint(height) {
        svg.setAttribute("viewBox", box[0] + " " + box[1] + " " + box[2] + " " + height);
        svg.setAttribute("height", height);
        if (axis) axis.setAttribute("y2", Math.max(0, height - 16));
      }
      if (!DURATION || from === to) {
        paint(to);
        return;
      }
      var started = performance.now();
      function frame(now) {
        var t = Math.min(1, (now - started) / DURATION);
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        paint(from + (to - from) * eased);
        if (t < 1) svg._tween = requestAnimationFrame(frame);
      }
      svg._tween = requestAnimationFrame(frame);
    }

    function apply(provider) {
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-provider") === provider));
      });
      charts.forEach(function (svg) {
        var step = parseFloat(svg.getAttribute("data-step"));
        var top = parseFloat(svg.getAttribute("data-top"));
        var groups = Array.prototype.slice.call(svg.querySelectorAll("g.grp"));
        var shown = 0;
        groups.forEach(function (g) {
          var keep = !provider || g.getAttribute("data-provider") === provider;
          if (keep) {
            // Slide into the slot the hidden rows vacated rather than reflowing.
            g.setAttribute("transform", "translate(0," + (top + shown * step) + ")");
            g.classList.remove("out");
            shown++;
          } else {
            g.classList.add("out");
          }
        });
        resize(svg, top + Math.max(shown, 1) * step);
      });
    }
    buttons.forEach(function (b) {
      b.addEventListener("click", function () { apply(b.getAttribute("data-provider")); });
    });
  }

  function explorer() {
    var root = document.getElementById("explorer");
    if (!root) return;
    var items = Array.prototype.slice.call(root.querySelectorAll("#filelist > li"));
    var docs = Array.prototype.slice.call(root.querySelectorAll(".viewer > .doc"));
    var input = document.getElementById("docfilter");
    var count = document.getElementById("doccount");
    if (!items.length) return;

    function select(index) {
      docs.forEach(function (d) { d.hidden = d.getAttribute("data-doc") !== index; });
      root.dispatchEvent(new Event("aligned"));
      items.forEach(function (li) {
        var button = li.querySelector("button");
        if (button.getAttribute("data-doc") === index) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
    }

    items.forEach(function (li) {
      li.querySelector("button").addEventListener("click", function () {
        select(li.querySelector("button").getAttribute("data-doc"));
      });
    });

    // Sit the file list at the height of the panels rather than the height of
    // the column, which also carries the filename and the page bar above them.
    var aside = root.querySelector(".files");
    function alignFiles() {
      if (!aside) return;
      if (window.innerWidth <= 860) { aside.style.marginTop = ""; return; }

      var doc = root.querySelector(".viewer > .doc:not([hidden])");
      // Centred on the panels, and only on the panels. Note the offsetParent
      // check: a panel is hidden along with the whole Pages view when the
      // signals tab is showing, and `:not([hidden])` still matches it because
      // the attribute is on its container. Measuring that ghost is what moved
      // the list about depending on which tab you were on.
      var panels = null;
      var candidates = doc ? doc.querySelectorAll(".spread:not([hidden])") : [];
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].offsetParent !== null) { panels = candidates[i]; break; }
      }
      if (!panels) { aside.style.marginTop = ""; return; }

      aside.style.marginTop = "0px";
      var top = root.getBoundingClientRect().top;
      var box = panels.getBoundingClientRect();
      var offset = box.top + box.height / 2 - top - aside.getBoundingClientRect().height / 2;
      aside.style.marginTop = Math.max(0, Math.round(offset)) + "px";
    }

    // Anything that changes the height of the workspace has to re-run this.
    // Watching the element covers the cases nobody thought to fire an event for:
    // a page image finishing its decode, a tab, a font, a window.
    root.addEventListener("aligned", alignFiles);
    window.addEventListener("resize", alignFiles);
    // The first paint happens before the page images have their size, and a
    // resize settles a frame after the event. Both would otherwise leave the
    // list sitting slightly off until the reader touched something.
    window.addEventListener("load", alignFiles);
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { alignFiles(); });
    }
    if (window.ResizeObserver) {
      var watcher = new ResizeObserver(function () { alignFiles(); });
      var viewer = root.querySelector(".viewer");
      if (viewer) watcher.observe(viewer);
    } else {
      Array.prototype.forEach.call(root.querySelectorAll(".viewer img"), function (image) {
        image.addEventListener("load", alignFiles);
      });
    }

    function firstVisible() {
      var li = items.filter(function (x) { return !x.hidden; })[0];
      return li ? li.querySelector("button").getAttribute("data-doc") : null;
    }

    function apply() {
      // Matches the file name, format, text source and the signals actually rated
      // poor — not the explanatory prose, which is identical in every document and
      // made a search for "rotated" return the whole folder.
      var q = input ? input.value.trim().toLowerCase() : "";
      var shown = 0;
      items.forEach(function (li) {
        var hit = !q || (li.getAttribute("data-search") || "").indexOf(q) !== -1;
        li.hidden = !hit;
        if (hit) shown++;
      });
      if (count) {
        count.textContent = q
          ? shown + " of " + items.length + " files"
          : items.length + (items.length === 1 ? " file" : " files");
      }
      var current = docs.filter(function (d) { return !d.hidden; })[0];
      var visible = firstVisible();
      if (visible && (!current || items.filter(function (li) {
        return !li.hidden && li.querySelector("button").getAttribute("data-doc") ===
          current.getAttribute("data-doc");
      }).length === 0)) {
        select(visible);
      }
    }

    if (input) input.addEventListener("input", apply);
    apply();
    select(items[0].querySelector("button").getAttribute("data-doc"));

    docs.forEach(function (doc) {
      var buttons = Array.prototype.slice.call(doc.querySelectorAll(".subtabs button"));
      var views = Array.prototype.slice.call(doc.querySelectorAll("[data-view]"))
        .filter(function (v) { return v.tagName !== "BUTTON"; });
      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          var want = button.getAttribute("data-view");
          buttons.forEach(function (b) {
            b.setAttribute("aria-selected", String(b === button));
          });
          views.forEach(function (v) { v.hidden = v.getAttribute("data-view") !== want; });
          root.dispatchEvent(new Event("aligned"));
        });
      });
      pageviewer(doc);
    });
    alignFiles();
  }

  // One page at a time, the page beside the text read off it. Every page of the
  // document is reachable: the arrows step, and the number box jumps straight to
  // a page, which is the only practical way through a long scan.
  function pageviewer(doc) {
    var bar = doc.querySelector(".pagebar");
    var spreads = Array.prototype.slice.call(doc.querySelectorAll(".pageview > .spread"))
      .filter(function (s) { return s.getAttribute("data-page") !== "0"; });
    // A document with no readable page still draws the workspace, with the
    // reason inside it; there is just nothing to step through.
    if (!bar || !spreads.length) return;

    var numbers = spreads.map(function (s) { return Number(s.getAttribute("data-page")); });
    var jump = bar.querySelector(".pjump");
    var missing = bar.querySelector(".pmiss");
    var steps = Array.prototype.slice.call(bar.querySelectorAll(".pstep"));
    var at = 0;

    function show(index) {
      at = Math.max(0, Math.min(spreads.length - 1, index));
      spreads.forEach(function (s, i) { s.hidden = i !== at; });
      steps.forEach(function (b) {
        var step = Number(b.getAttribute("data-step"));
        b.disabled = step < 0 ? at === 0 : at === spreads.length - 1;
      });
      if (jump && document.activeElement !== jump) jump.value = String(numbers[at]);
      if (missing) missing.hidden = true;
      var explorer = doc.closest("#explorer");
      if (explorer) explorer.dispatchEvent(new Event("aligned"));
    }

    steps.forEach(function (button) {
      button.addEventListener("click", function () {
        show(at + Number(button.getAttribute("data-step")));
      });
    });

    if (jump) {
      jump.addEventListener("input", function () {
        var wanted = Number(jump.value);
        if (jump.value === "") { if (missing) missing.hidden = true; return; }
        var index = numbers.indexOf(wanted);
        // A page number the document does not have is said so rather than
        // silently snapping to the nearest one, which would be a lie about
        // which page you are looking at.
        if (index === -1) { if (missing) missing.hidden = false; return; }
        show(index);
      });
      jump.addEventListener("blur", function () { show(at); });
    }

    // The pages where the readers parted company are the only ones worth
    // looking at when comparing, and on a long document they are a handful
    // among hundreds. Wraps around, so the button keeps working at the end.
    var differing = bar.querySelector(".pdiff");
    if (differing) {
      var marked = [];
      spreads.forEach(function (s, i) {
        if (s.getAttribute("data-differs") === "1") marked.push(i);
      });
      if (!marked.length) {
        differing.hidden = true;
      } else {
        differing.addEventListener("click", function () {
          var next = marked.find(function (i) { return i > at; });
          show(next === undefined ? marked[0] : next);
        });
      }
    }

    doc.addEventListener("keydown", function (event) {
      if (event.target === jump || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft") { show(at - 1); event.preventDefault(); }
      if (event.key === "ArrowRight") { show(at + 1); event.preventDefault(); }
    });

    // Pointing at a mark on the layout says what it is, beside the mark. The
    // <title> in the markup says the same thing for a reader without script and
    // for a screen reader; this is only quicker and does not wait for the
    // browser's own tooltip delay.
    Array.prototype.slice.call(doc.querySelectorAll(".pv-mark")).forEach(function (mark) {
      var face = mark.closest(".face");
      var tipText = mark.getAttribute("data-tip");
      if (!face || !tipText) return;

      function show() {
        var tip = face.querySelector(".pv-tip");
        if (!tip) {
          tip = document.createElement("div");
          tip.className = "pv-tip";
          face.appendChild(tip);
        }
        var lines = tipText.split("\n");
        tip.textContent = "";
        var head = document.createElement("b");
        head.textContent = lines[0];
        tip.appendChild(head);
        // What was found, masked as the findings table masks it. A rectangle
        // and a category leaves you hunting for which one it was.
        var found = mark.getAttribute("data-value");
        if (found) {
          var shown = document.createElement("span");
          shown.className = "found";
          shown.textContent = found;
          tip.appendChild(shown);
        }
        if (lines.length > 1) {
          var rest = document.createElement("span");
          rest.className = "why";
          rest.textContent = lines.slice(1).join(" ");
          tip.appendChild(rest);
        }
        tip.hidden = false;

        // Placed above the mark where there is room, below it where there is
        // not, and kept inside the panel either way so it is never clipped.
        var box = mark.getBoundingClientRect();
        var frame = face.getBoundingClientRect();
        var gap = 6;
        var left = box.left - frame.left;
        var top = box.top - frame.top - tip.offsetHeight - gap;
        if (top < 0) top = box.bottom - frame.top + gap;
        var overflow = left + tip.offsetWidth - frame.width;
        if (overflow > 0) left -= overflow;
        tip.style.left = Math.max(0, left) + "px";
        tip.style.top = Math.max(0, top) + "px";
      }
      function hide() {
        var tip = face.querySelector(".pv-tip");
        if (tip) tip.hidden = true;
      }
      mark.addEventListener("pointerenter", show);
      mark.addEventListener("pointerleave", hide);
      mark.addEventListener("focus", show);
      mark.addEventListener("blur", hide);
      mark.setAttribute("tabindex", "0");
    });

    // The page/layout and text/OCR switches, scoped to the side they sit in.
    Array.prototype.slice.call(doc.querySelectorAll(".spread .swap")).forEach(function (swap) {
      var side = swap.closest(".side");
      var options = Array.prototype.slice.call(swap.querySelectorAll("button"));
      var faces = Array.prototype.slice.call(side.querySelectorAll(".face"));
      options.forEach(function (option) {
        option.addEventListener("click", function () {
          var want = option.getAttribute("data-face");
          options.forEach(function (o) { o.setAttribute("aria-selected", String(o === option)); });
          faces.forEach(function (f) { f.hidden = f.getAttribute("data-face") !== want; });
          var explorer = doc.closest("#explorer");
          if (explorer) explorer.dispatchEvent(new Event("aligned"));
        });
      });
    });

    show(0);
  }

  function theme() {
    var button = document.getElementById("theme");
    if (!button) return;
    button.hidden = false;
    var root = document.documentElement;

    function current() {
      var set = root.getAttribute("data-theme");
      if (set) return set;
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    function paint() {
      var dark = current() === "dark";
      button.textContent = dark ? "Light" : "Dark";
      button.setAttribute("aria-pressed", String(dark));
    }
    button.addEventListener("click", function () {
      root.setAttribute("data-theme", current() === "dark" ? "light" : "dark");
      paint();
    });
    paint();
  }

  function paginate(table) {
    var size = parseInt(table.getAttribute("data-paginate"), 10);
    var body = table.tBodies[0];
    if (!body || !size) return;
    if (body.rows.length <= size) return;

    var page = 0;
    var pages = Math.ceil(body.rows.length / size);

    var bar = document.createElement("div");
    bar.className = "pager";
    var prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Previous";
    var next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    var label = document.createElement("span");
    bar.appendChild(prev);
    bar.appendChild(next);
    bar.appendChild(label);
    var host = table.parentNode;
    host.parentNode.insertBefore(bar, host.nextSibling);

    function draw() {
      // Re-read the rows every time: sorting reorders them in the DOM, so a
      // list captured once would page through yesterday's order.
      var rows = Array.prototype.slice.call(body.rows);
      var first = page * size;
      var last = Math.min(first + size, rows.length);
      rows.forEach(function (row, i) { row.hidden = i < first || i >= last; });
      label.textContent = "Showing " + (first + 1) + "\u2013" + last + " of " + rows.length;
      prev.disabled = page === 0;
      next.disabled = page >= pages - 1;
    }
    prev.addEventListener("click", function () { if (page > 0) { page--; draw(); } });
    next.addEventListener("click", function () { if (page < pages - 1) { page++; draw(); } });
    table.addEventListener("sorted", function () { page = 0; draw(); });
    draw();
  }

  // Click a column to reorder. Numeric columns sort on data-value when a cell
  // carries one, which is how severity sorts high > medium > low rather than
  // alphabetically.
  function sortable(table) {
    var body = table.tBodies[0];
    if (!body) return;
    var headers = Array.prototype.slice.call(table.querySelectorAll("th[data-sort]"));

    function value(row, index, kind) {
      var cell = row.cells[index];
      if (!cell) return kind === "num" ? 0 : "";
      var explicit = cell.getAttribute("data-value");
      var text = explicit !== null ? explicit : cell.textContent.trim();
      return kind === "num" ? parseFloat(text.replace(/[^0-9.\-]/g, "")) || 0 : text.toLowerCase();
    }

    headers.forEach(function (header) {
      var index = Array.prototype.indexOf.call(header.parentNode.cells, header);
      var kind = header.getAttribute("data-sort");
      header.tabIndex = 0;
      header.setAttribute("role", "button");
      if (header.getAttribute("data-sort-default")) {
        header.setAttribute("aria-sort", "descending");
      }

      function apply() {
        var descending = header.getAttribute("aria-sort") !== "descending";
        headers.forEach(function (h) { h.removeAttribute("aria-sort"); });
        header.setAttribute("aria-sort", descending ? "descending" : "ascending");
        Array.prototype.slice.call(body.rows)
          .sort(function (a, b) {
            var left = value(a, index, kind);
            var right = value(b, index, kind);
            if (left === right) return 0;
            return (left < right ? -1 : 1) * (descending ? -1 : 1);
          })
          .forEach(function (row) { body.appendChild(row); });
        table.dispatchEvent(new Event("sorted"));
      }

      header.addEventListener("click", apply);
      header.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); apply(); }
      });
    });
  }


  function tabs() {
    var nav = document.getElementById("tabs");
    if (!nav) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll("a"));
    var pages = Array.prototype.slice.call(document.querySelectorAll("section[data-page]"));

    function show(id) {
      var known = pages.some(function (p) { return p.id === id; });
      if (!known) id = pages[0].id;
      pages.forEach(function (p) { p.hidden = p.id !== id; });
      links.forEach(function (a) {
        if (a.getAttribute("data-tab") === id) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
      window.scrollTo(0, 0);
      // The documents page cannot be measured while it is hidden, so anything
      // laid out against its contents is told the moment it is shown.
      var explorer = document.getElementById("explorer");
      if (explorer) explorer.dispatchEvent(new Event("aligned"));
    }
    // The click is the mechanism; the hash is a convenience on top of it. Some
    // viewers — a data: URL, a sandboxed mail preview — never report a hash, and
    // relying on it there would leave every tab dead but the first.
    links.forEach(function (a) {
      a.addEventListener("click", function (event) {
        event.preventDefault();
        var id = a.getAttribute("data-tab");
        show(id);
        try {
          history.replaceState(null, "", "#" + id);
        } catch (err) {
          /* file:// and data: URLs may refuse; the view has already switched. */
        }
      });
    });
    window.addEventListener("hashchange", function () {
      show(location.hash.replace("#", ""));
    });
    show(location.hash.replace("#", "") || pages[0].id);
  }

  function paginateList(host) {
    var size = parseInt(host.getAttribute("data-paginate-list"), 10);
    var items = Array.prototype.slice.call(host.children);
    if (!size || items.length <= size) return;
    var page = 0, count = Math.ceil(items.length / size);
    var bar = document.createElement("div");
    bar.className = "pager";
    var prev = document.createElement("button"); prev.type = "button"; prev.textContent = "Previous";
    var next = document.createElement("button"); next.type = "button"; next.textContent = "Next";
    var label = document.createElement("span");
    bar.appendChild(prev); bar.appendChild(next); bar.appendChild(label);
    host.parentNode.insertBefore(bar, host.nextSibling);
    function draw() {
      var first = page * size, last = Math.min(first + size, items.length);
      items.forEach(function (el, i) { el.hidden = i < first || i >= last; });
      label.textContent = "Showing " + (first + 1) + "\u2013" + last + " of " + items.length;
      prev.disabled = page === 0; next.disabled = page >= count - 1;
    }
    prev.addEventListener("click", function () { if (page > 0) { page--; draw(); } });
    next.addEventListener("click", function () { if (page < count - 1) { page++; draw(); } });
    draw();
  }

  tabs();
  Array.prototype.forEach.call(
    document.querySelectorAll("[data-paginate-list]"), paginateList
  );
  explorer();
  providerFilter();
  theme();
  Array.prototype.forEach.call(document.querySelectorAll("table[data-sortable]"), sortable);
  Array.prototype.forEach.call(
    document.querySelectorAll("table[data-paginate]"), paginate
  );
})();

(function () {
  var cells = Array.prototype.slice.call(document.querySelectorAll("[data-cm-cell]"));
  var rows = Array.prototype.slice.call(document.querySelectorAll("#content-findings tbody tr"));
  var reset = document.getElementById("cm-reset");
  function apply(key) {
    rows.forEach(function (row) { row.hidden = !!key && row.getAttribute("data-cm") !== key; });
    cells.forEach(function (cell) { cell.classList.toggle("sel", cell.getAttribute("data-cm-cell") === key); });
    if (reset) reset.hidden = !key;
  }
  cells.forEach(function (cell) {
    cell.addEventListener("click", function () {
      apply(cell.classList.contains("sel") ? null : cell.getAttribute("data-cm-cell"));
    });
  });
  if (reset) reset.addEventListener("click", function () { apply(null); });
})();
