import { isAuthOperation, isInviteOperation } from './rateLimiter';

describe('isAuthOperation', () => {
  it('detects a plain login mutation', () => {
    expect(isAuthOperation('mutation { login(email: "a", password: "b") { token } }')).toBe(true);
  });

  it('detects signup with an operation name and variables', () => {
    expect(isAuthOperation('mutation Signup($e: String!) { signup(name: "n", email: $e, password: "p") { token } }')).toBe(true);
  });

  it('detects login hidden behind a comment before the arguments', () => {
    expect(isAuthOperation('mutation { login #x\n(email: "a", password: "b") { token } }')).toBe(true);
  });

  it('detects login behind an alias', () => {
    expect(isAuthOperation('mutation { a: login(email: "a", password: "b") { token } }')).toBe(true);
  });

  it('detects login inside a fragment', () => {
    expect(isAuthOperation('mutation { ...F } fragment F on mutations { login(email: "a", password: "b") { token } }')).toBe(true);
  });

  it('ignores other operations', () => {
    expect(isAuthOperation('query { artists { name } }')).toBe(false);
    expect(isAuthOperation('mutation { logPageView(path: "/login") { success } }')).toBe(false);
  });

  it('returns false for unparseable queries', () => {
    expect(isAuthOperation('mutation { login(')).toBe(false);
  });
});

describe('isInviteOperation', () => {
  it('detects invite lookups and joins, even behind an alias', () => {
    expect(isInviteOperation('query { groupOrderByInvite(token: "t") { name } }')).toBe(true);
    expect(isInviteOperation('mutation { j: joinGroupOrder(token: "t", acceptTerms: true) { id } }')).toBe(true);
  });

  it('ignores other group order operations', () => {
    expect(isInviteOperation('query { myGroupOrders { id } }')).toBe(false);
    expect(isAuthOperation('query { groupOrderByInvite(token: "t") { name } }')).toBe(false);
  });
});
