import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  isAuthenticated?: boolean;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Allow introspection queries and public queries to pass through
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    req.isAuthenticated = false;
    return next();
  }

  const token = authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token || token === '') {
    req.isAuthenticated = false;
    return next();
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string };
    req.userId = decodedToken.userId;
    req.userRole = decodedToken.role;
    req.isAuthenticated = true;
    next();
  } catch (err) {
    req.isAuthenticated = false;
    next();
  }
};

export const generateToken = (userId: string, role: string): string => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' } // Token expires in 7 days
  );
};

export const requireAuth = (isAuthenticated?: boolean) => {
  if (!isAuthenticated) {
    throw new Error('Authentication required. Please log in.');
  }
};

export const requireAdmin = (isAuthenticated?: boolean, userRole?: string) => {
  requireAuth(isAuthenticated);
  if (userRole !== 'admin') {
    throw new Error('Admin privileges required. You do not have permission to perform this action.');
  }
};
