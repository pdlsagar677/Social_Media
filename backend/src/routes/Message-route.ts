import express, { Router } from "express";
import isAuthenticated from "../middlewares/IsAuthencated";
// import upload from "../middlewares/Multer.js";
import { getMessage, sendMessage } from "../controllers/Message-controller";

const router: Router = express.Router();

router.route('/send/:id').post(isAuthenticated, sendMessage);
router.route('/all/:id').get(isAuthenticated, getMessage);

export default router;
