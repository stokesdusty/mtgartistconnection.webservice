import { connect } from 'mongoose';

export const connectToDatabase = async() => {
    try {
        await connect(`mongodb+srv://stokesdusty:${process.env.MONGODB_PASSWORD}@cluster0.mo7516l.mongodb.net/?retryWrites=true&w=majority`)
    } catch (err) {
        console.log(err);
        throw new Error(err);
    }
};