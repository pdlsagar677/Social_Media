import sharp from "sharp";
import  { Types } from "mongoose";
import cloudinary from "../utils/cloudinary";
import { Post } from "../models/Post-model";
import { User } from "../models/User-model";
import { Comment } from "../models/Comment-model";
import { getReceiverSocketId, io } from "../socket/socket";
import { Request, Response } from "express";

interface CustomRequest extends Request {
  id?: string;
  file?: Express.Multer.File;
}

interface Notification {
  type: string;
  userId: string;
  userDetails?: { username?: string; profilePicture?: string };
  postId: string;
  message: string;
}

export const addNewPost = async (req: CustomRequest, res: Response): Promise<Response> => {
  try {
    const image = req.file;
    const authorId = req.id;
    if (!image || !authorId) return res.status(400).json({ message: "Image and user required", success: false });

    const buffer = await sharp(image.buffer)
      .resize({ width: 800, height: 800, fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();

    const fileUri = "data:image/jpeg;base64," + buffer.toString("base64");
    const cloudResponse = await cloudinary.uploader.upload(fileUri);

    const post = await Post.create({ caption: req.body.caption, image: cloudResponse.secure_url, author: authorId });

    const user = await User.findById(authorId);
    if (user) { user.posts.push(post._id as Types.ObjectId); await user.save(); }

    await post.populate("author", "-password");
    return res.status(201).json({ message: "New post added", post, success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const getAllPost = async (_req: Request, res: Response): Promise<Response> => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate("author", "username profilePicture")
      .populate({
        path: "comments",
        options: { sort: { createdAt: -1 } },
        populate: { path: "author", select: "username profilePicture" }
      });
    return res.status(200).json({ posts, success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const getUserPost = async (req: CustomRequest, res: Response): Promise<Response> => {
  try {
    const posts = await Post.find({ author: req.id })
      .sort({ createdAt: -1 })
      .populate("author", "username profilePicture")
      .populate({
        path: "comments",
        options: { sort: { createdAt: -1 } },
        populate: { path: "author", select: "username profilePicture" }
      });
    return res.status(200).json({ posts, success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const likePost = async (req: CustomRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.id!;
    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found", success: false });

    await post.updateOne({ $addToSet: { likes: userId } });
    await post.save();

    const user = await User.findById(userId).select("username profilePicture");
    const postOwnerId = post.author.toString();

    if (postOwnerId !== userId) {
      const notification: Notification = {
        type: "like",
        userId,
        userDetails: user || undefined,
        postId,
        message: "Your post was liked"
      };
      const socketId = getReceiverSocketId(postOwnerId);
      if (socketId) io.to(socketId).emit("notification", notification);
    }

    return res.status(200).json({ message: "Post liked", success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const dislikePost = async (req: CustomRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.id!;
    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found", success: false });

    await post.updateOne({ $pull: { likes: userId } });
    await post.save();

    const user = await User.findById(userId).select("username profilePicture");
    const postOwnerId = post.author.toString();

    if (postOwnerId !== userId) {
      const notification: Notification = {
        type: "dislike",
        userId,
        userDetails: user || undefined,
        postId,
        message: "Your post was disliked"
      };
      const socketId = getReceiverSocketId(postOwnerId);
      if (socketId) io.to(socketId).emit("notification", notification);
    }

    return res.status(200).json({ message: "Post disliked", success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const addComment = async (req: CustomRequest, res: Response): Promise<Response> => {
  try {
    const postId = req.params.id;
    const userId = req.id!;
    const { text } = req.body;

    if (!text) return res.status(400).json({ message: "Text required", success: false });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found", success: false });

    const comment = await Comment.create({ text, author: userId, post: postId });
    await comment.populate("author", "username profilePicture");

post.comments.push(comment._id as Types.ObjectId);
    await post.save();

    return res.status(201).json({ message: "Comment added", comment, success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const getCommentsOfPost = async (req: Request, res: Response): Promise<Response> => {
  try {
    const postId = req.params.id;
    const comments = await Comment.find({ post: postId }).populate("author", "username profilePicture");
    if (!comments.length) return res.status(404).json({ message: "No comments found", success: false });
    return res.status(200).json({ comments, success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const deletePost = async (req: CustomRequest, res: Response): Promise<Response> => {
  try {
    const postId = req.params.id;
    const userId = req.id!;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found", success: false });

    if (post.author.toString() !== userId)
      return res.status(403).json({ message: "Unauthorized", success: false });

    await Post.findByIdAndDelete(postId);
    await Comment.deleteMany({ post: postId });

    const user = await User.findById(userId);
    if (user) {
      user.posts = user.posts.filter(pId => pId.toString() !== postId);
      await user.save();
    }

    return res.status(200).json({ message: "Post deleted", success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", success: false });
  }
};

export const bookmarkPost = async (req: CustomRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.id!;
    const postId = req.params.id;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found", success: false });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found", success: false });

if (user.bookmarks.includes(post._id as Types.ObjectId)) {
      await user.updateOne({ $pull: { bookmarks: post._id } });
      return res.status(200).json({ type: "unsaved", message: "Post removed from bookmark", success: true });
    } else {
      await user.updateOne({ $addToSet: { bookmarks: post._id } });
      return res.status(200).json({ type: "saved", message: "Post bookmarked", success: true });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", success: false });
  }
};
