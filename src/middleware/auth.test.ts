process.env.JWT_SECRET = 'test-jwt-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

import * as jwt from 'jsonwebtoken';
import {
  requireAuth,
  requireAdmin,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  authMiddleware,
  AuthRequest,
} from './auth';
import { Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------
describe('requireAuth', () => {
  it('throws when isAuthenticated is undefined', () => {
    expect(() => requireAuth(undefined)).toThrow('Authentication required');
  });

  it('throws when isAuthenticated is false', () => {
    expect(() => requireAuth(false)).toThrow('Authentication required');
  });

  it('does not throw when isAuthenticated is true', () => {
    expect(() => requireAuth(true)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// requireAdmin
// ---------------------------------------------------------------------------
describe('requireAdmin', () => {
  it('throws when not authenticated', () => {
    expect(() => requireAdmin(false, 'admin')).toThrow('Authentication required');
  });

  it('throws when authenticated but role is not admin', () => {
    expect(() => requireAdmin(true, 'user')).toThrow('Admin privileges required');
  });

  it('throws when authenticated but role is undefined', () => {
    expect(() => requireAdmin(true, undefined)).toThrow('Admin privileges required');
  });

  it('does not throw when authenticated as admin', () => {
    expect(() => requireAdmin(true, 'admin')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// generateToken / jwt verification round-trip
// ---------------------------------------------------------------------------
describe('generateToken', () => {
  it('returns a string', () => {
    expect(typeof generateToken('user-1', 'user')).toBe('string');
  });

  it('encodes userId and role in the payload', () => {
    const token = generateToken('user-123', 'admin');
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    expect(decoded.userId).toBe('user-123');
    expect(decoded.role).toBe('admin');
  });

  it('produces different tokens for different users', () => {
    const t1 = generateToken('user-1', 'user');
    const t2 = generateToken('user-2', 'user');
    expect(t1).not.toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// generateRefreshToken / verifyRefreshToken round-trip
// ---------------------------------------------------------------------------
describe('generateRefreshToken + verifyRefreshToken', () => {
  it('round-trips userId and role', () => {
    const token = generateRefreshToken('user-42', 'user');
    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe('user-42');
    expect(decoded.role).toBe('user');
  });

  it('verifyRefreshToken throws on a token signed with the wrong secret', () => {
    const badToken = jwt.sign({ userId: 'x', role: 'user' }, 'wrong-secret');
    expect(() => verifyRefreshToken(badToken)).toThrow();
  });

  it('verifyRefreshToken throws on a garbage string', () => {
    expect(() => verifyRefreshToken('not.a.token')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// authMiddleware
// ---------------------------------------------------------------------------
const mockNext = jest.fn() as unknown as NextFunction;
const mockRes = {} as Response;

const makeReq = (authHeader?: string): AuthRequest =>
  ({ headers: authHeader ? { authorization: authHeader } : {} } as any);

beforeEach(() => {
  (mockNext as jest.Mock).mockClear();
});

describe('authMiddleware', () => {
  it('sets isAuthenticated=false and calls next when no Authorization header', () => {
    const req = makeReq();
    authMiddleware(req, mockRes, mockNext);
    expect(req.isAuthenticated).toBe(false);
    expect(mockNext).toHaveBeenCalled();
  });

  it('sets isAuthenticated=false when Authorization header has no token', () => {
    const req = makeReq('Bearer ');
    authMiddleware(req, mockRes, mockNext);
    expect(req.isAuthenticated).toBe(false);
  });

  it('sets isAuthenticated=true and populates userId/userRole for a valid token', () => {
    const token = generateToken('user-99', 'admin');
    const req = makeReq(`Bearer ${token}`);
    authMiddleware(req, mockRes, mockNext);
    expect(req.isAuthenticated).toBe(true);
    expect(req.userId).toBe('user-99');
    expect(req.userRole).toBe('admin');
    expect(mockNext).toHaveBeenCalled();
  });

  it('sets isAuthenticated=false for a token signed with the wrong secret', () => {
    const badToken = jwt.sign({ userId: 'x', role: 'user' }, 'wrong-secret');
    const req = makeReq(`Bearer ${badToken}`);
    authMiddleware(req, mockRes, mockNext);
    expect(req.isAuthenticated).toBe(false);
    expect(mockNext).toHaveBeenCalled();
  });

  it('sets isAuthenticated=false for a completely invalid token string', () => {
    const req = makeReq('Bearer garbage.token.value');
    authMiddleware(req, mockRes, mockNext);
    expect(req.isAuthenticated).toBe(false);
    expect(mockNext).toHaveBeenCalled();
  });

  it('sets isAuthenticated=false for an expired token', () => {
    const expiredToken = jwt.sign(
      { userId: 'u1', role: 'user' },
      process.env.JWT_SECRET!,
      { expiresIn: -1 },
    );
    const req = makeReq(`Bearer ${expiredToken}`);
    authMiddleware(req, mockRes, mockNext);
    expect(req.isAuthenticated).toBe(false);
  });
});
