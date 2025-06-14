import { Request, Response } from "express";
import { Conversation } from "../models/Conversation-model";
import { getReceiverSocketId, io } from "../socket/Socket";
import { Message } from "../models/Message-model";

interface AuthRequest extends Request {
  id?: string; // your auth middleware should assign this
}

// For sending message
export const sendMessage = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const senderId = req.id!;
    const receiverId = req.params.id;
    const { textMessage: message } = req.body as { textMessage: string };

    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId],
      });
    }

    const newMessage = await Message.create({
      senderId,
      receiverId,
      message,
    });

    if (newMessage) conversation.messages.push(newMessage._id);

    await Promise.all([conversation.save(), newMessage.save()]);

    // Socket.io real-time notification
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    return res.status(201).json({
      success: true,
      newMessage,
    });
  } catch (error) {
    console.log(error);
  }
};

// For getting messages between users
export const getMessage = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const senderId = req.id!;
    const receiverId = req.params.id;

    const conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId] },
    }).populate("messages");

    if (!conversation) return res.status(200).json({ success: true, messages: [] });

    return res.status(200).json({ success: true, messages: conversation.messages });
  } catch (error) {
    console.log(error);
  }
};
