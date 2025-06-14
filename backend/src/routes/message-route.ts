import express, { Router } from "express";
import isAuthenticated from "../middlewares/isAuthenticated";
import { getMessage, sendMessage } from "../controllers/message-controller";
const router: Router = express.Router();

// POST: send a message to another user
router.post("/send/:id", isAuthenticated, sendMessage);

// GET: get all messages between logged-in user and another user
router.get("/all/:id", isAuthenticated, getMessage);

export default router;
