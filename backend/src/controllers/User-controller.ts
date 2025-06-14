import { Request, Response } from 'express';
import { User } from '../models/User-model';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import getDataUri from '../utils/Datauri';
import cloudinary from '../utils/Cloudinary';
import { Post } from '../models/Post-model';

// Extend Request interface for custom properties like req.id and req.file
interface AuthRequest extends Request {
  id?: string; // User ID from auth middleware
  file?: Express.Multer.File; // uploaded file from multer
}

export const register = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { username, email, password } = req.body as {
      username: string;
      email: string;
      password: string;
    };

    if (!username || !email || !password) {
      return res.status(401).json({
        message: 'Something is missing, please check!',
        success: false,
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(401).json({
        message: 'Try different email',
        success: false,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      username,
      email,
      password: hashedPassword,
    });

    return res.status(201).json({
      message: 'Account created successfully.',
      success: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const login = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return res.status(401).json({
        message: 'Something is missing, please check!',
        success: false,
      });
    }

    let user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        message: 'Incorrect email or password',
        success: false,
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        message: 'Incorrect email or password',
        success: false,
      });
    }

    const token = jwt.sign({ userId: user._id.toString() }, process.env.SECRET_KEY as string, {
      expiresIn: '1d',
    });

    // Populate user's posts (filter posts authored by user)
    const populatedPosts = await Promise.all(
      (user.posts || []).map(async (postId) => {
        const post = await Post.findById(postId);
        if (post && post.author.equals(user._id)) {
          return post;
        }
        return null;
      })
    );

    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      bio: user.bio,
      followers: user.followers,
      following: user.following,
      posts: populatedPosts.filter((p): p is NonNullable<typeof p> => p !== null),
    };

    return res
      .cookie('token', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 1 * 24 * 60 * 60 * 1000,
      })
      .json({
        message: `Welcome back ${user.username}`,
        success: true,
        user: userResponse,
      });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const logout = async (_req: Request, res: Response): Promise<Response> => {
  try {
    return res.cookie('token', '', { maxAge: 0 }).json({
      message: 'Logged out successfully.',
      success: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const getProfile = async (req: Request, res: Response): Promise<Response> => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .populate({ path: 'posts', options: { sort: { createdAt: -1 } } })
      .populate('bookmarks');

    if (!user) {
      return res.status(404).json({ message: 'User not found', success: false });
    }

    return res.status(200).json({
      user,
      success: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const editProfile = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized', success: false });
    }

    const { bio, gender } = req.body as { bio?: string; gender?: string };
    const profilePicture = req.file;
    let cloudResponse;

    if (profilePicture) {
      const fileUri = getDataUri(profilePicture);
      cloudResponse = await cloudinary.uploader.upload(fileUri);
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        message: 'User not found.',
        success: false,
      });
    }

    if (bio) user.bio = bio;
    if (gender) user.gender = gender;
    if (profilePicture && cloudResponse) user.profilePicture = cloudResponse.secure_url;

    await user.save();

    return res.status(200).json({
      message: 'Profile updated.',
      success: true,
      user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const getSuggestedUsers = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.id) {
      return res.status(401).json({ message: 'Unauthorized', success: false });
    }

    const suggestedUsers = await User.find({ _id: { $ne: req.id } }).select('-password');

    if (!suggestedUsers || suggestedUsers.length === 0) {
      return res.status(400).json({
        message: 'Currently do not have any users',
        success: false,
      });
    }

    return res.status(200).json({
      success: true,
      users: suggestedUsers,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};

export const followOrUnfollow = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const followerId = req.id;
    const followeeId = req.params.id;

    if (!followerId) {
      return res.status(401).json({ message: 'Unauthorized', success: false });
    }

    if (followerId === followeeId) {
      return res.status(400).json({
        message: 'You cannot follow/unfollow yourself',
        success: false,
      });
    }

    const user = await User.findById(followerId);
    const targetUser = await User.findById(followeeId);

    if (!user || !targetUser) {
      return res.status(400).json({
        message: 'User not found',
        success: false,
      });
    }

    const isFollowing = user.following.includes(followeeId);

    if (isFollowing) {
      // Unfollow
      await Promise.all([
        User.updateOne({ _id: followerId }, { $pull: { following: followeeId } }),
        User.updateOne({ _id: followeeId }, { $pull: { followers: followerId } }),
      ]);
      return res.status(200).json({ message: 'Unfollowed successfully', success: true });
    } else {
      // Follow
      await Promise.all([
        User.updateOne({ _id: followerId }, { $push: { following: followeeId } }),
        User.updateOne({ _id: followeeId }, { $push: { followers: followerId } }),
      ]);
      return res.status(200).json({ message: 'Followed successfully', success: true });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', success: false });
  }
};
