import { Request, Response } from "express";
import { Conversation } from "../models/Conversation-model";
import { getReceiverSocketId, io } from "../socket/socket";
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
        messages: [],
      });
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      message,
    });

    await newMessage.save();

conversation.messages.push(newMessage.id);
    await conversation.save();

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
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
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
