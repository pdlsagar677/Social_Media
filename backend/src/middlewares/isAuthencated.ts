import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AuthRequest extends Request {
  cookies: { token?: string };
  id?: string;
}

const isAuthenticated = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.cookies.token;

    if (!token) {
      res.status(401).json({ message: 'User not authenticated', success: false });
      return;
    }

    const decoded = jwt.verify(token, process.env.SECRET_KEY as string) as { userId: string };

    req.id = decoded.userId;
    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: 'Authentication failed', success: false });
  }
};

export default isAuthenticated;
