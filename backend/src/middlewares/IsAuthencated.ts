import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Request interface to include cookies and id
interface AuthRequest extends Request {
  cookies: { token?: string };  // cookies should be non-optional if you use cookie-parser
  id?: string;
}

const isAuthenticated = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({
        message: 'User not authenticated',
        success: false,
      });
    }

    const decoded = jwt.verify(token, process.env.SECRET_KEY as string) as { userId: string };

    req.id = decoded.userId;
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({
      message: 'Authentication failed',
      success: false,
    });
  }
};

export default isAuthenticated;
