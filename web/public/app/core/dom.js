// @ts-check
/**
 * Tiny DOM helpers. Every piece of data is added as a text node or an
 * attribute value, never as HTML, so patient names and notes can never run
 * as script (XSS-safe by construction).
 */

/**
 * @typedef {Record<string, unknown>} Props
 * Keys starting with "on" become event listeners; `class`, `dataset`, `style`
 * and `attrs` are handled specially; any other key is set as an attribute
 * (or as a property for value/checked/disabled/hidden/selected).
 */

/** @typedef {Node | string | number | null | undefined | false | readonly any[]} Child */

const PROPERTIES = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'indeterminate']);

/**
 * Creates an element: h('button', { class: 'btn', onclick: fn }, 'Save').
 *
 * @template {string} K
 * @param {K} tag
 * @param {Props | null} [props]
 * @param {...Child} children
 * @returns {K extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[K] : HTMLElement}
 */
export function h(tag, props, ...children) {
  const el = /** @type {any} */ (document.createElement(tag));
  applyProps(el, props ?? {});
  append(el, children);
  return el;
}

/**
 * @param {Element} el
 * @param {Props} props
 */
export function applyProps(el, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) {
      if (PROPERTIES.has(key) && key in el) {
        /** @type {any} */ (el)[key] = false;
      }
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), /** @type {EventListener} */ (value));
    } else if (key === 'class') {
      el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value));
    } else if (key === 'dataset') {
      Object.assign(/** @type {HTMLElement} */ (el).dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        /** @type {HTMLElement} */ (el).style.setProperty(prop, String(v));
      }
    } else if (PROPERTIES.has(key) && key in el) {
      /** @type {any} */ (el)[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
}

/**
 * @param {Node} parent
 * @param {Child[]} children
 */
export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Replaces all children of `el`.
 *
 * @param {Element} el
 * @param {...Child} children
 */
export function replace(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

/** Line-art icons (24x24, stroke). Drawn for this project. */
const ICONS = {
  logo: 'M12 4v16M4 12h16',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  patients: 'M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 5.15a3.5 3.5 0 0 1 0 6.7',
  staff: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0M12 15v4M10 17h4',
  appointments: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h0M8 17h2M12 17h2',
  records: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6',
  queue: 'M4 6h16M4 12h10M4 18h6M18 14l3 3-3 3',
  audit: 'M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3zM9 12l2 2 4-4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  alert: 'M12 9v4M12 17h0M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h0',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  print: 'M7 9V3h10v6M7 18H5a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  sort: 'M8 9l4-4 4 4M8 15l4 4 4-4',
  sortUp: 'M8 14l4-4 4 4',
  sortDown: 'M8 10l4 4 4-4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0',
  peso: 'M7 20V4h6a4 4 0 0 1 0 8H7M5 8h12M5 11h12',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  stethoscope: 'M6 3v5a4 4 0 0 0 8 0V3M10 12v3a5 5 0 0 0 10 0v-2M20 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  move: 'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
};

/** @typedef {keyof typeof ICONS} IconName */

/**
 * @param {IconName} name
 * @param {string} [label] accessible name; omit for decorative icons
 */
export function icon(name, label) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  svg.appendChild(path);
  return svg;
}

/**
 * SVG element helper for charts.
 *
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {...(Node | string)} children
 */
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  for (const c of children) {
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Initials for an avatar, e.g. "Maria Santos" -> "MS". @param {string} name */
export function initialsOf(name) {
  return name.replace(/^Dr\.\s*/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** Peso amount for the UI: "₱1,234.00". @param {number} amount */
export function peso(amount) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** @param {number} ms */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the user prefers less motion. */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Triggers a file download of text content.
 *
 * @param {string} filename
 * @param {string} content
 * @param {string} type
 */
export function downloadText(filename, content, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), content], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
