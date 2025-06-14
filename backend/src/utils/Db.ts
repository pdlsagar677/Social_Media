import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error("MONGO_URI is not defined in environment variables.");
        }

        await mongoose.connect(mongoUri);
        console.log('MongoDB connected successfully.');
    } catch (error) {
        console.error('MongoDB connection error:', error);
    }
};

export default connectDB;
