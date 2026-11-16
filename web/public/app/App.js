// @ts-check
import { Clock, TimeOfDay, ZoneClock } from '/domain/index.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ApiClient } from './core/ApiClient.js';
import { AppointmentActions } from './core/AppointmentActions.js';
import { h, icon, initialsOf, replace } from './core/dom.js';
import { Router } from './core/Router.js';
import { Theme } from './core/Theme.js';
import { Toaster } from './core/Toaster.js';
import { AppointmentsPage } from './pages/AppointmentsPage.js';
import { ChangePasswordDialog } from './components/dialogs/AccountDialogs.js';
import { AccountsPage } from './pages/AccountsPage.js';
import { AuditPage } from './pages/AuditPage.js';
import { CalendarPage } from './pages/CalendarPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { PatientProfilePage } from './pages/PatientProfilePage.js';
import { PatientsPage } from './pages/PatientsPage.js';
import { QueuePage } from './pages/QueuePage.js';
import { RecordsPage } from './pages/RecordsPage.js';
import { StaffPage } from './pages/StaffPage.js';

/**
 * @typedef {object} CurrentUser
 * @property {string} id
 * @property {string} username
 * @property {string} displayName
 * @property {string} role
 * @property {string} roleLabel
 * @property {string | null} staffId
 * @property {string[]} permissions
 */

/** Sidebar entries: [route, label, icon, permission needed]. */
const NAV = /** @type {const} */ ([
  ['/dashboard', 'Dashboard', 'dashboard', 'stats:read'],
  ['/appointments', 'Appointments', 'appointments', 'appointments:read'],
  ['/calendar', 'Calendar', 'calendar', 'appointments:read'],
  ['/queue', 'Queue', 'queue', 'queue:manage'],
  ['/patients', 'Patients', 'patients', 'patients:read'],
  ['/staff', 'Medical Staff', 'staff', 'staff:read'],
  ['/records', 'Records', 'records', 'records:read'],
  ['/audit', 'Audit Log', 'audit', 'audit:read'],
  ['/accounts', 'Accounts', 'key', 'users:manage'],
]);

/**
 * The application shell: signs the user in, draws the sidebar and header,
 * and swaps pages when the route changes. It only knows pages as BasePage
 * objects (POLYMORPHISM).
 */
export class App extends EventTarget {
  api = new ApiClient();
  toaster = new Toaster();
  router = new Router('/dashboard');
  theme = new Theme();
  actions = new AppointmentActions(this);
  /** @type {any} */
  config = null;
  /** @type {CurrentUser | null} */
  user = null;
  /** @type {import('./pages/BasePage.js').BasePage | null} */
  #page = null;
  #root;
  #content = h('main', { class: 'content', id: 'main' });
  /** @type {CommandPalette | null} */
  #palette = null;

  /** @param {HTMLElement} root */
  constructor(root) {
    super();
    this.#root = root;
    this.api.addEventListener('unauthorized', () => {
      if (this.user) {
        this.user = null;
        this.toaster.error('Your session ended', 'Please sign in again.');
        this.#showLogin();
      }
    });
    this.router.addEventListener('change', () => this.#route());
  }

  async start() {
    try {
      this.config = await this.api.config();
    } catch (err) {
      this.#root.replaceChildren(h('div', { class: 'empty-state' }, h('strong', null, 'CareConnect is not reachable'), /** @type {Error} */ (err).message));
      return;
    }
    Clock.use(new ZoneClock(this.config.timeZone));
    try {
      this.user = await this.api.me();
    } catch {
      this.user = null;
    }
    this.user = this.user ?? null;
    if (this.user) {
      this.#showShell();
    } else {
      this.#showLogin();
    }
  }

  /** @param {string} permission */
  can(permission) {
    return Boolean(this.user?.permissions.includes(permission));
  }

  /** Staff ID a Doctor account is limited to, if any. */
  get staffScope() {
    return this.user?.role === 'DOCTOR' ? this.user.staffId ?? undefined : undefined;
  }

  /** Today in clinic time. */
  today() {
    return Clock.current().today();
  }

  /** "14:30" -> "02:30 PM" @param {string} hhmm */
  formatTime(hhmm) {
    return TimeOfDay.parse(hhmm).format12h();
  }

  /** @param {string} type @param {unknown} [detail] */
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Re-runs the current page's refresh(). */
  refreshPage() {
    return this.#page?.safeRefresh();
  }

  /** @param {CurrentUser} user */
  signedIn(user) {
    this.user = user;
    this.toaster.success(`Welcome, ${user.displayName}`);
    this.#showShell();
  }

  async signOut() {
    try {
      await this.api.logout();
    } catch {
      // Signing out locally is still correct if the server cannot be reached.
    } finally {
      this.user = null;
      this.#showLogin();
    }
  }

  #showLogin() {
    this.#page?.unmount();
    this.#page = null;
    this.#palette = null;
    const page = new LoginPage(this);
    document.title = 'Sign in · CareConnect';
    this.#root.replaceChildren(page.render());
    page.afterRender();
  }

  #showShell() {
    const user = /** @type {CurrentUser} */ (this.user);
    const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
      NAV.filter(([, , , perm]) => this.can(perm)).map(([path, label, name]) =>
        h('a', { href: `#${path}`, dataset: { nav: path }, onclick: () => this.#closeNav() }, icon(name), label)),
      h('div', { class: 'nav-label' }, 'Displays'),
      h('a', { href: '/board', target: '_blank', rel: 'noopener' }, icon('external'), 'Queue board', h('span', { class: 'sr-only' }, '(opens in a new tab)')));
    const sidebar = h('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Sidebar' },
      h('a', { class: 'brand', href: '#/dashboard' },
        h('span', { class: 'brand-mark' }, icon('logo')),
        h('span', null, h('span', { class: 'brand-name' }, 'CareConnect'), h('span', { class: 'brand-sub' }, 'Clinic Appointments'))),
      nav,
      h('div', { class: 'sidebar-foot' }, 'LSPU · OOP Final Project', h('br'), 'Times shown in Philippine time'));
    const menuButton = h('button', {
      class: 'btn btn-ghost btn-icon menu-button', type: 'button', 'aria-label': 'Open menu', 'aria-controls': 'sidebar', 'aria-expanded': 'false',
      onclick: () => this.#toggleNav(),
    }, icon('menu'));
    const themeButton = h('button', { class: 'btn btn-ghost btn-icon', type: 'button', onclick: () => this.#cycleTheme(themeButton) });
    this.#paintThemeButton(themeButton);
    const topbar = h('header', { class: 'topbar' },
      menuButton,
      h('button', { class: 'search-trigger', type: 'button', 'aria-keyshortcuts': 'Control+K', onclick: () => this.openPalette() },
        icon('search'), h('span', { class: 'label' }, 'Search patients, staff, pages…'), h('span', { class: 'sr-only' }, 'Search'), h('span', { class: 'kbd', 'aria-hidden': 'true' }, 'Ctrl K')),
      h('div', { class: 'spacer' }),
      themeButton,
      h('div', { class: 'user-chip' },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, initialsOf(user.displayName)),
        h('span', { class: 'user-meta' }, h('strong', null, user.displayName), h('span', null, user.roleLabel))),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Change password', title: 'Change password', onclick: () => this.#changePassword() }, icon('key')),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Sign out', title: 'Sign out', onclick: () => this.signOut() }, icon('logout')));
    replace(this.#root,
      h('a', { class: 'skip-link', href: '#main', onclick: (/** @type {Event} */ e) => {
        e.preventDefault();
        this.#content.querySelector('h1')?.focus();
      } }, 'Skip to content'),
      this.config.demoMode ? h('div', { class: 'demo-banner', role: 'note' }, 'Demo mode: sample data only. Do not enter real patient information.') : null,
      !this.config.persistentStorage ? h('div', { class: 'demo-banner', role: 'alert' },
        'Records are not being saved permanently: they will be lost when the server restarts. Set DATABASE_URL in the server settings.') : null,
      h('div', { class: 'app' }, sidebar, h('div', { class: 'scrim', onclick: () => this.#closeNav() }), h('div', { class: 'main' }, topbar, this.#content)));
    this.#palette = new CommandPalette(this);
    this.#installShortcuts();
    this.#route();
  }

  #route() {
    if (!this.user) {
      return;
    }
    const { route, params } = this.router.resolve();
    this.#page?.unmount();
    const page = route.create(params);
    this.#page = page;
    document.title = `${page.title} · CareConnect`;
    for (const link of this.#root.querySelectorAll('[data-nav]')) {
      const key = /** @type {HTMLElement} */ (link).dataset.nav;
      if (key === page.navKey) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
    page.mount(this.#content);
  }

  /** Every screen, keyed by route. */
  installRoutes() {
    this.router
      .add({ pattern: '/dashboard', create: () => new DashboardPage(this) })
      .add({ pattern: '/appointments', create: () => new AppointmentsPage(this) })
      .add({ pattern: '/calendar', create: () => new CalendarPage(this) })
      .add({ pattern: '/queue', create: () => new QueuePage(this) })
      .add({ pattern: '/patients', create: () => new PatientsPage(this) })
      .add({ pattern: '/patients/:id', create: (p) => new PatientProfilePage(this, p.id) })
      .add({ pattern: '/staff', create: () => new StaffPage(this) })
      .add({ pattern: '/records', create: () => new RecordsPage(this) })
      .add({ pattern: '/audit', create: () => new AuditPage(this) })
      .add({ pattern: '/accounts', create: () => new AccountsPage(this) });
    return this;
  }

  async #changePassword() {
    if (await new ChangePasswordDialog(this).open()) {
      this.toaster.success('Password changed', 'Other devices have been signed out.');
    }
  }

  openPalette() {
    this.#palette?.open();
  }

  #installShortcuts() {
    if (this.#shortcutsInstalled) {
      return;
    }
    this.#shortcutsInstalled = true;
    document.addEventListener('keydown', (e) => {
      if (!this.user) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openPalette();
        return;
      }
      const target = /** @type {HTMLElement} */ (e.target);
      // Alt+N books an appointment (a modifier key, so it never fires while typing: WCAG 2.1.4).
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n' && this.can('appointments:book') && !target.closest('dialog')) {
        e.preventDefault();
        this.actions.book().then((changed) => changed && this.refreshPage());
      }
      if (e.key === 'Escape' && this.#root.querySelector('.app.nav-open')) {
        this.#closeNav();
        /** @type {HTMLElement | null} */ (this.#root.querySelector('.menu-button'))?.focus();
      }
    });
  }

  #shortcutsInstalled = false;

  #toggleNav() {
    const app = this.#root.querySelector('.app');
    const open = !app?.classList.contains('nav-open');
    app?.classList.toggle('nav-open', open);
    this.#root.querySelector('.menu-button')?.setAttribute('aria-expanded', String(open));
    if (open) {
      /** @type {HTMLElement | null} */ (this.#root.querySelector('.nav a'))?.focus();
    }
  }

  #closeNav() {
    this.#root.querySelector('.app')?.classList.remove('nav-open');
    this.#root.querySelector('.menu-button')?.setAttribute('aria-expanded', 'false');
  }

  /** @param {HTMLButtonElement} button */
  #cycleTheme(button) {
    this.theme.toggle();
    this.#paintThemeButton(button);
  }

  /** @param {HTMLButtonElement} button */
  #paintThemeButton(button) {
    const dark = this.theme.isDark;
    button.replaceChildren(icon(dark ? 'sun' : 'moon'));
    button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    button.title = dark ? 'Light theme' : 'Dark theme';
  }
}
