import { isAuthOperation, isInviteOperation, proxiedVisitorIp } from './rateLimiter';

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

describe('proxiedVisitorIp', () => {
  const req = (ip: string, headers: Record<string, string>) => ({ ip, headers }) as any;

  it('finds the visitor behind CloudFront: the hop before the edge Express trusted', () => {
    expect(proxiedVisitorIp(req('130.176.1.1', { 'x-amz-cf-id': 'abc', 'x-forwarded-for': '203.0.113.7, 130.176.1.1' }))).toBe('203.0.113.7');
  });

  it("ignores whatever the visitor put at the front of the header", () => {
    expect(proxiedVisitorIp(req('130.176.1.1', { 'x-amz-cf-id': 'abc', 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 130.176.1.1' }))).toBe('203.0.113.7');
  });

  it('handles IPv6 visitors', () => {
    expect(proxiedVisitorIp(req('130.176.1.1', { 'x-amz-cf-id': 'abc', 'x-forwarded-for': '2001:db8::1, 130.176.1.1' }))).toBe('2001:db8::1');
  });

  it.each([
    ['not through CloudFront', { 'x-forwarded-for': '203.0.113.7, 198.51.100.2' }],
    ['a single hop', { 'x-amz-cf-id': 'abc', 'x-forwarded-for': '198.51.100.2' }],
    ['a last hop that is not the address Express trusted', { 'x-amz-cf-id': 'abc', 'x-forwarded-for': '203.0.113.7, 10.0.0.9' }],
    ['a visitor hop that is not an IP', { 'x-amz-cf-id': 'abc', 'x-forwarded-for': 'not-an-ip, 198.51.100.2' }],
  ])('falls back to req.ip for %s', (_case, headers) => {
    expect(proxiedVisitorIp(req('198.51.100.2', headers))).toBe('198.51.100.2');
  });
});
