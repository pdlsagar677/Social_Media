import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend the Request interface to include `cookies`
interface AuthRequest extends Request {
  cookies: {
    token?: string;
  };
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

    const decode = jwt.verify(token, process.env.SECRET_KEY as string) as { userId: string };

    req.id = decode.userId;
    next();
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: 'Authentication failed',
      success: false,
    });
  }
};

export default isAuthenticated;
