import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import getDataUri from '../utils/Datauri';
import cloudinary from '../utils/Cloudinary';
import { IUser, User } from '../models/User-model'; // your User model file path
import { IPost, Post } from '../models/Post-model'; // your Post model file path

// Extend Request interface for custom properties like req.id and req.file
interface AuthRequest extends Request {
  id?: string; // User ID from auth middleware
  file?: Express.Multer.File; // uploaded file from multer
}




export const login = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return res.status(401).json({
        message: 'Something is missing, please check!',
        success: false,
      });
    }

    // Explicitly type user as IUser | null
    const user: IUser | null = await User.findOne({ email });
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

    const secretKey = process.env.SECRET_KEY;
    if (!secretKey) {
      throw new Error('SECRET_KEY is not defined');
    }

    // Cast user._id to Types.ObjectId explicitly
    const userId = user._id as Types.ObjectId;

    const token = jwt.sign({ userId: userId.toString() }, secretKey, {
      expiresIn: '1d',
    });

    // Map over posts array with explicit typing
    const populatedPosts: (IPost | null)[] = await Promise.all(
      (user.posts || []).map(async (postId) => {
        // Cast postId to Types.ObjectId to avoid red underline
        const postObjectId = postId as Types.ObjectId;

        const post = await Post.findById(postObjectId);
        // Use .equals with cast user._id
        if (post && post.author.equals(userId)) {
          return post;
        }
        return null;
      })
    );

    const filteredPosts: IPost[] = populatedPosts.filter(
      (p): p is IPost => p !== null
    );

    const userResponse = {
      _id: userId,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      bio: user.bio,
      followers: user.followers,
      following: user.following,
      posts: filteredPosts,
    };

    return res
      .cookie('token', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
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
  if (!fileUri) {
    return res.status(400).json({ message: 'Invalid file format', success: false });
  }
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
    if (gender) (user as any).gender = gender; // Cast if gender not in model
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

    // Use string comparison for ObjectIds
    const isFollowing = user.following.some(
      (id) => id.toString() === followeeId
    );

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
