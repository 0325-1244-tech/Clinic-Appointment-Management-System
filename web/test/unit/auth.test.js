import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccessPolicy, AdminPolicy, DoctorPolicy, Permission, ReceptionistPolicy } from '../../src/auth/AccessPolicy.js';
import { AuthService } from '../../src/auth/AuthService.js';
import { AuthenticationError, RateLimitError } from '../../src/auth/errors.js';
import { PasswordHasher } from '../../src/auth/PasswordHasher.js';
import { RateLimiter, SessionStore } from '../../src/auth/SessionStore.js';
import { User, UserRole } from '../../src/auth/User.js';

const fastHasher = new PasswordHasher({ cost: 1024 });

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
  it('never exposes the password hash and requires a staff link for doctors', async () => {
    const hash = await fastHasher.hash('pw-123456');
    const user = new User({ id: 'U-1', username: 'Admin', displayName: 'Admin', role: 'ADMIN', passwordHash: hash });
    assert.equal(user.username, 'admin');
    assert.equal(JSON.stringify(user.toPublic()).includes('scrypt'), false);
    assert.equal('passwordHash' in user, false);
    assert.throws(() => new User({ id: 'U-2', username: 'd', displayName: 'D', role: UserRole.DOCTOR, passwordHash: hash }), /linked to a staff record/);
  });
});

describe('AccessPolicy', () => {
  it('is abstract and picks the policy for each role', async () => {
    assert.throws(() => new AccessPolicy(), /abstract/);
    const hash = await fastHasher.hash('pw');
    const make = (/** @type {string} */ role, /** @type {string | undefined} */ staffId) =>
      AccessPolicy.for(new User({ id: 'U', username: 'u', displayName: 'U', role, staffId, passwordHash: hash }));
    assert.ok(make('ADMIN') instanceof AdminPolicy);
    assert.ok(make('RECEPTIONIST') instanceof ReceptionistPolicy);
    assert.ok(make('DOCTOR', 'S-0001') instanceof DoctorPolicy);
  });

  it('keeps clinical findings away from the front desk', () => {
    assert.equal(new ReceptionistPolicy().can(Permission.FINDINGS_READ), false);
    assert.equal(new DoctorPolicy('S-0001').can(Permission.FINDINGS_READ), true);
    assert.equal(new AdminPolicy().can(Permission.FINDINGS_READ), true);
  });

  it('fails closed: a doctor policy without a staff link cannot be created', () => {
    assert.throws(() => new DoctorPolicy(''), /must be linked/);
  });
});

describe('AuthService', () => {
  it('signs in, rate-limits per address and username, and does not let one user lock out another address', async () => {
    const auth = new AuthService({ hasher: fastHasher });
    await auth.seedAccounts({ demoMode: true });
    const { token } = await auth.login('admin', 'admin123', '10.0.0.1');
    assert.equal(auth.userForToken(token)?.username, 'admin');
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(auth.login('admin', 'nope', '10.0.0.66'), AuthenticationError);
    }
    await assert.rejects(auth.login('admin', 'admin123', '10.0.0.66'), RateLimitError);
    const other = await auth.login('admin', 'admin123', '10.0.0.2');
    assert.ok(other.token, 'the real admin on another address can still sign in');
    auth.logout(other.token);
    assert.equal(auth.userForToken(other.token), undefined);
  });

  it('limits failures per address across usernames', async () => {
    const auth = new AuthService({ hasher: fastHasher, addressLimiter: new RateLimiter({ max: 3, windowMinutes: 15 }) });
    await auth.seedAccounts({ demoMode: true });
    for (const name of ['a', 'b', 'c']) {
      await assert.rejects(auth.login(name, 'x', '10.0.0.9'), AuthenticationError);
    }
    await assert.rejects(auth.login('admin', 'admin123', '10.0.0.9'), RateLimitError);
  });

  it('uses environment passwords outside demo mode and rejects short ones', async () => {
    const auth = new AuthService({ hasher: fastHasher });
    assert.deepEqual(await auth.seedAccounts({ demoMode: false, env: { ADMIN_PASSWORD: 'a-long-password' } }), ['admin']);
    await assert.rejects(new AuthService({ hasher: fastHasher }).seedAccounts({ demoMode: false, env: { ADMIN_PASSWORD: 'short' } }), /at least 10/);
  });
});

describe('SessionStore and RateLimiter', () => {
  it('expires idle sessions', () => {
    let now = 0;
    const sessions = new SessionStore({ idleMinutes: 1, now: () => now });
    const token = sessions.create('U-1');
    assert.equal(sessions.touch(token)?.userId, 'U-1');
    now = 61_000;
    assert.equal(sessions.touch(token), undefined);
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
