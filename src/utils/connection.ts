import { connect } from 'mongoose';

export const connectToDatabase = async() => {
    try {
        await connect(process.env.MONGODB_URI as string)
    } catch (err) {
        console.log(err);
        throw new Error(err);
    }
};