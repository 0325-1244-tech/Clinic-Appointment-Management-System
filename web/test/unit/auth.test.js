import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccessPolicy, AdminPolicy, DoctorPolicy, Permission, ReceptionistPolicy } from '../../src/auth/AccessPolicy.js';
import { AuthService } from '../../src/auth/AuthService.js';
import { AuthenticationError, RateLimitError } from '../../src/auth/errors.js';
import { PasswordHasher } from '../../src/auth/PasswordHasher.js';
import { RateLimiter, SessionStore } from '../../src/auth/SessionStore.js';
import { User, UserMapper, UserRole } from '../../src/auth/User.js';
import { ConflictError, ValidationError } from '../../src/domain/index.js';
import { InMemoryRepository } from '../../src/repositories/InMemoryRepository.js';

const fastHasher = new PasswordHasher({ cost: 1024 });
const HASH = 'scrypt$1024$8$1$AAAA$BBBB';

describe('PasswordHasher', () => {
  it('hashes with a random salt and verifies in constant time', async () => {
    const a = await fastHasher.hash('secret-pass');
    const b = await fastHasher.hash('secret-pass');
    assert.notEqual(a, b);
    assert.match(a, /^scrypt\$1024\$8\$1\$/);
    assert.equal(await fastHasher.verify('secret-pass', a), true);
    assert.equal(await fastHasher.verify('wrong', a), false);
    assert.equal(await fastHasher.verify('x', 'md5$abc'), false);
  });
});

describe('User', () => {
  it('never exposes the password hash to the browser and keeps the username fixed', () => {
    const user = new User({ id: 'U-1', username: 'Admin', displayName: 'Admin', role: 'ADMIN', passwordHash: HASH });
    assert.equal(user.username, 'admin');
    assert.equal(JSON.stringify(user.toPublic()).includes('scrypt'), false);
    assert.equal('passwordHash' in user, false);
    assert.throws(() => {
      /** @type {any} */ (user).username = 'root';
    }, TypeError);
  });

  it('validates usernames, names and the doctor staff link', () => {
    const base = { id: 'U-1', displayName: 'X', passwordHash: HASH };
    assert.throws(() => new User({ ...base, username: 'a b', role: 'ADMIN' }), /Username must be 3 to 30/);
    assert.throws(() => new User({ ...base, username: 'ab', role: 'ADMIN' }), ValidationError);
    assert.throws(() => new User({ ...base, username: 'doc', role: UserRole.DOCTOR }), /linked to a staff record/);
    assert.throws(() => new User({ ...base, username: 'abc', role: 'ADMIN', displayName: ' ' }), /Display name is required/);
    const doc = new User({ ...base, username: 'doc', role: 'DOCTOR', staffId: 'S-0001' });
    doc.setRole('RECEPTIONIST', 'S-0001');
    assert.equal(doc.staffId, undefined, 'only doctors keep a staff link');
  });

  it('is stored and loaded with its password hash and active flag', () => {
    const mapper = new UserMapper();
    const user = new User({ id: 'U-1', username: 'doc', displayName: 'Doc', role: 'DOCTOR', staffId: 'S-0001', passwordHash: HASH, active: false });
    const record = mapper.toRecord(user);
    assert.deepEqual(record, { id: 'U-1', username: 'doc', displayName: 'Doc', role: 'DOCTOR', staffId: 'S-0001', active: false, passwordHash: HASH });
    assert.deepEqual(mapper.toRecord(mapper.fromRecord(record)), record);
  });
});

describe('AccessPolicy', () => {
  it('is abstract and picks the policy for each role', () => {
    assert.throws(() => new AccessPolicy(), /abstract/);
    const make = (/** @type {string} */ role, /** @type {string | undefined} */ staffId) =>
      AccessPolicy.for(new User({ id: 'U', username: 'user', displayName: 'U', role, staffId, passwordHash: HASH }));
    assert.ok(make('ADMIN') instanceof AdminPolicy);
    assert.ok(make('RECEPTIONIST') instanceof ReceptionistPolicy);
    assert.ok(make('DOCTOR', 'S-0001') instanceof DoctorPolicy);
  });

  it('keeps clinical findings and account management with the right roles', () => {
    assert.equal(new ReceptionistPolicy().can(Permission.FINDINGS_READ), false);
    assert.equal(new DoctorPolicy('S-0001').can(Permission.FINDINGS_READ), true);
    assert.equal(new AdminPolicy().can(Permission.USERS_MANAGE), true);
    assert.equal(new ReceptionistPolicy().can(Permission.USERS_MANAGE), false);
    assert.equal(new DoctorPolicy('S-0001').can(Permission.USERS_MANAGE), false);
  });

  it('fails closed: a doctor policy without a staff link cannot be created', () => {
    assert.throws(() => new DoctorPolicy(''), /must be linked/);
  });
});

/** @param {Partial<ConstructorParameters<typeof AuthService>[0]>} [options] */
function service(options = {}) {
  return new AuthService({ hasher: fastHasher, ...options });
}

describe('AuthService: setup', () => {
  it('demo mode creates the three demo accounts once', async () => {
    const auth = service();
    assert.deepEqual(await auth.seedDemoAccounts(), ['admin', 'reception', 'drsantos']);
    assert.deepEqual(await auth.seedDemoAccounts(), []);
    assert.equal(auth.listUsers().length, 3);
  });

  it('official mode creates the first administrator from the settings, only once', async () => {
    const users = new InMemoryRepository('U');
    const auth = service({ users });
    assert.ok(auth.needsSetup());
    assert.equal(await auth.ensureAdministrator({}), 'missing');
    await assert.rejects(auth.ensureAdministrator({ password: 'short' }), /ADMIN_PASSWORD must be at least 10/);
    assert.equal(await auth.ensureAdministrator({ username: 'owner', password: 'a-long-password' }), 'created');
    assert.equal(await auth.ensureAdministrator({ username: 'owner', password: 'another-long-one' }), 'exists');
    assert.equal(auth.needsSetup(), false);
    const { user } = await auth.login('owner', 'a-long-password', '10.0.0.1');
    assert.equal(user.role, UserRole.ADMIN);
  });
});

describe('AuthService: sign-in', () => {
  it('rate-limits per address and username, without locking the user out elsewhere', async () => {
    const auth = service();
    await auth.seedDemoAccounts();
    const { token } = await auth.login('admin', 'admin123', '10.0.0.1');
    assert.equal(auth.userForToken(token)?.username, 'admin');
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(auth.login('admin', 'nope', '10.0.0.66'), AuthenticationError);
    }
    await assert.rejects(auth.login('admin', 'admin123', '10.0.0.66'), RateLimitError);
    const other = await auth.login('admin', 'admin123', '10.0.0.2');
    auth.logout(other.token);
    assert.equal(auth.userForToken(other.token), undefined);
  });

  it('limits failures per address across usernames', async () => {
    const auth = service({ addressLimiter: new RateLimiter({ max: 3, windowMinutes: 15 }) });
    await auth.seedDemoAccounts();
    for (const name of ['a', 'b', 'c']) {
      await assert.rejects(auth.login(name, 'x', '10.0.0.9'), AuthenticationError);
    }
    await assert.rejects(auth.login('admin', 'admin123', '10.0.0.9'), RateLimitError);
  });
});

describe('AuthService: accounts', () => {
  async function withAdmin() {
    const auth = service();
    await auth.ensureAdministrator({ username: 'owner', password: 'owner-password' });
    const admin = auth.listUsers()[0];
    return { auth, admin };
  }

  it('creates accounts with unique usernames, long passwords and one account per doctor', async () => {
    const { auth } = await withAdmin();
    const desk = await auth.createUser({ username: 'Desk1', displayName: 'Front Desk', role: 'RECEPTIONIST', password: 'desk-password' });
    assert.equal(desk.username, 'desk1');
    await assert.rejects(auth.createUser({ username: 'desk1', displayName: 'X', role: 'RECEPTIONIST', password: 'desk-password' }), ConflictError);
    await assert.rejects(auth.createUser({ username: 'desk2', displayName: 'X', role: 'RECEPTIONIST', password: 'short' }), /at least 10/);
    await auth.createUser({ username: 'drsantos', displayName: 'Dr. Santos', role: 'DOCTOR', staffId: 'S-0001', password: 'doctor-password' });
    await assert.rejects(auth.createUser({ username: 'dr2', displayName: 'X', role: 'DOCTOR', staffId: 'S-0001', password: 'doctor-password' }), /already has an account/);
    assert.deepEqual(auth.listUsers().map((u) => u.username), ['owner', 'desk1', 'drsantos']);
  });

  it('deactivating an account ends its sessions and blocks sign-in', async () => {
    const { auth, admin } = await withAdmin();
    const desk = await auth.createUser({ username: 'desk', displayName: 'Desk', role: 'RECEPTIONIST', password: 'desk-password' });
    const { token } = await auth.login('desk', 'desk-password', '10.0.0.1');
    auth.updateUser(admin, desk.id, { displayName: 'Desk', role: 'RECEPTIONIST', active: false });
    assert.equal(auth.userForToken(token), undefined);
    await assert.rejects(auth.login('desk', 'desk-password', '10.0.0.1'), AuthenticationError);
  });

  it('always keeps an active administrator, and nobody can lock themselves out', async () => {
    const { auth, admin } = await withAdmin();
    assert.throws(() => auth.updateUser(admin, admin.id, { displayName: 'Owner', role: 'ADMIN', active: false }), /your own account/);
    assert.throws(() => auth.updateUser(admin, admin.id, { displayName: 'Owner', role: 'RECEPTIONIST', active: true }), /your own account/);
    const second = await auth.createUser({ username: 'boss', displayName: 'Boss', role: 'ADMIN', password: 'boss-password' });
    auth.updateUser(second, admin.id, { displayName: 'Owner', role: 'ADMIN', active: false });
    assert.throws(() => auth.updateUser(admin, second.id, { displayName: 'Boss', role: 'RECEPTIONIST', active: true }), /at least one active administrator/);
    assert.throws(() => auth.updateUser(admin, 'U-9999', { displayName: 'X', role: 'ADMIN', active: true }), /was not found/);
  });

  it('an invalid edit changes nothing', async () => {
    const { auth, admin } = await withAdmin();
    const desk = await auth.createUser({ username: 'desk', displayName: 'Desk', role: 'RECEPTIONIST', password: 'desk-password' });
    assert.throws(() => auth.updateUser(admin, desk.id, { displayName: 'Renamed', role: 'DOCTOR', active: true }), /linked to a staff record/);
    assert.equal(auth.getUser(desk.id).displayName, 'Desk');
  });

  it('an administrator resets a password; the old one stops working and sessions end', async () => {
    const { auth } = await withAdmin();
    const desk = await auth.createUser({ username: 'desk', displayName: 'Desk', role: 'RECEPTIONIST', password: 'desk-password' });
    const { token } = await auth.login('desk', 'desk-password', '10.0.0.1');
    await assert.rejects(auth.resetPassword(desk.id, 'tiny'), /at least 10/);
    await auth.resetPassword(desk.id, 'brand-new-password');
    assert.equal(auth.userForToken(token), undefined);
    await assert.rejects(auth.login('desk', 'desk-password', '10.0.0.2'), AuthenticationError);
    assert.ok((await auth.login('desk', 'brand-new-password', '10.0.0.2')).token);
  });

  it('users change their own password; other sessions end but the current one stays', async () => {
    const { auth } = await withAdmin();
    const first = await auth.login('owner', 'owner-password', '10.0.0.1');
    const second = await auth.login('owner', 'owner-password', '10.0.0.2');
    const user = first.user;
    await assert.rejects(auth.changeOwnPassword(user, 'wrong', 'new-password-1', first.token), /current password is not correct/);
    await assert.rejects(auth.changeOwnPassword(user, 'owner-password', 'short', first.token), /at least 10/);
    await assert.rejects(auth.changeOwnPassword(user, 'owner-password', 'owner-password', first.token), /different from the current/);
    await auth.changeOwnPassword(user, 'owner-password', 'new-password-1', first.token);
    assert.equal(auth.userForToken(first.token)?.username, 'owner');
    assert.equal(auth.userForToken(second.token), undefined);
  });
});

describe('SessionStore and RateLimiter', () => {
  it('expires idle sessions and ends all sessions of a user', () => {
    let now = 0;
    const sessions = new SessionStore({ idleMinutes: 1, now: () => now });
    const token = sessions.create('U-1');
    const other = sessions.create('U-1');
    assert.equal(sessions.touch(token)?.userId, 'U-1');
    sessions.destroyForUser('U-1', other);
    assert.equal(sessions.touch(token), undefined);
    assert.equal(sessions.touch(other)?.userId, 'U-1');
    now = 61_000;
    assert.equal(sessions.touch(other), undefined);
    assert.equal(sessions.touch(undefined), undefined);
  });

  it('counts hits in a window and resets', () => {
    let now = 0;
    const limiter = new RateLimiter({ max: 2, windowMinutes: 1, now: () => now });
    limiter.hit('k');
    assert.equal(limiter.retryAfter('k'), 0);
    limiter.hit('k');
    assert.equal(limiter.retryAfter('k'), 60);
    now = 60_000;
    assert.equal(limiter.retryAfter('k'), 0);
    limiter.hit('k');
    limiter.reset('k');
    assert.equal(limiter.retryAfter('k'), 0);
  });
});
