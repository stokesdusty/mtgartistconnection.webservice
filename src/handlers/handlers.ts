import { GraphQLID, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { ArtistType, UserType } from "../schema/schema";
import Artist from "../models/Artist";
import { Document, startSession } from "mongoose";
import User from "../models/User";
import { hashSync } from "bcrypt-nodejs";

type DocumentType = Document<any, any, any>;

const RootQuery = new GraphQLObjectType({
    name: "RootQuery",
    fields: {
        // Get all artists
        artists: {
            type: GraphQLList(ArtistType),
            async resolve() {
                return await Artist.find().sort({ name: 1 }).collation({ locale: "en", caseLevel: true });
            },
        },
        artistByName: {
            type: ArtistType,
            args: { name: { type: GraphQLNonNull(GraphQLString)}},
            async resolve(parent, { name }) {
                return await Artist.findOne({ name: name }).exec();
            },
        },
        users: {
            type: GraphQLList(UserType),
            async resolve() {
                return await User.find();
            }
        },
    },
});

const mutations = new GraphQLObjectType({
    name: "mutations",
    fields: {
         // user signup
         signup: {
            type: UserType,
            args: {
                name: { type: GraphQLNonNull(GraphQLString) },
                email: { type: GraphQLNonNull(GraphQLString) },
                password: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, {name, email, password}) {
                let existingUser:DocumentType;
                try {
                    existingUser = await User.findOne({email });
                    if(existingUser) return new Error("User already exists");
                    const encryptedPassword = hashSync(password);
                    const user = new User({name, email, password: encryptedPassword});
                    return await user.save();
                } catch (err) {
                    return new Error("User Signup Failed. Try again.");
                }
            },
        },
        // user login
        login: {
            type: UserType,
            args: {
                email: { type: GraphQLNonNull(GraphQLString) },
                password: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, {email, password}) {
                let existingUser:DocumentType;
                try {
                    existingUser = await User.findOne({email});
                    if (!existingUser) return new Error("No User registered with this email");
                    // @ts-ignore
                    const decryptedPassword = compareSync(password, existingUser?.password);
                    if(!decryptedPassword) return new Error("Incorrect Password");
                    return existingUser;
                } catch (err) {
                    return new Error(err);
                }
            },
        },
        // add artist
        addArtist: {
            type: ArtistType,
            args: {
                name: { type: GraphQLNonNull(GraphQLString) },
                email: { type: GraphQLString },
                artistProofs: { type: GraphQLString },
                facebook: { type: GraphQLString },
                haveSignature: { type: GraphQLString },
                instagram: { type: GraphQLString },
                patreon: { type: GraphQLString }, 
                signing: { type: GraphQLString },
                signingComment: { type: GraphQLString },
                twitter: { type: GraphQLString },
                url: { type: GraphQLString },
                youtube: { type: GraphQLString },
                mountainmage: { type: GraphQLString },
                markssignatureservice: { type: GraphQLString },
                filename: { type: GraphQLString },
                artstation: { type: GraphQLString },
                location: { type: GraphQLString },
            },
            async resolve(
                parent,
                {
                    name,
                    email,
                    artistProofs,
                    facebook,
                    haveSignature,
                    instagram,
                    patreon,
                    signing,
                    signingComment,
                    twitter,
                    url,
                    youtube,
                    mountainmage,
                    markssignatureservice,
                    filename,
                    artstation,
                    location,
                }
                ) {
                let existingArtist:DocumentType;
                try {
                    existingArtist = await Artist.findOne({name});
                    if(existingArtist) return new Error("Artist already exists");
                    const artist = new Artist(
                        {
                            name,
                            email,
                            artistProofs,
                            facebook,
                            haveSignature,
                            instagram,
                            patreon,
                            signing,
                            signingComment,
                            twitter,
                            url,
                            youtube,
                            mountainmage,
                            markssignatureservice,
                            filename,
                            artstation,
                            location,
                        });
                    return await artist.save();
                } catch (err) {
                    return new Error("Artist Signup Failed. Try again.");
                }
            },
        },
        // delete artist
        deleteArtist: {
            type: ArtistType,
            args: {
                id: { type: GraphQLNonNull(GraphQLID) },
            },
            async resolve(parent, { id }) {
                const session = await startSession();
                let artist:DocumentType;
                try {
                    session.startTransaction({ session });
                    artist = await Artist.findById(id);
                    if (!artist) return new Error("Artist not found");
                    // @ts-ignore
                    return await Artist.findByIdAndDelete(artist.id);
                } catch (err) {
                    return new Error(err);
                } finally {
                    await session.commitTransaction();
                }
            },
        },
        deleteAllArtists: {
            type: GraphQLList(ArtistType),
            async resolve(parent) {
                return await Artist.deleteMany({});
            }
        },
        updateArtist: {
            type: ArtistType,
            args: {
                id: { type: GraphQLNonNull(GraphQLID) },
                fieldName: { type: GraphQLNonNull(GraphQLString) },
                valueToSet: { type: GraphQLNonNull(GraphQLString) }
            },
            async resolve(parent, { id, fieldName, valueToSet }){
                const session = await startSession();
                let artist:DocumentType;
                let updateValue = {};
                updateValue[fieldName] = valueToSet;
                try {
                    session.startTransaction({session});
                    artist = await Artist.findById(id);
                    if (!artist) return new Error("Artist not found");
                    return await Artist.findByIdAndUpdate(
                            { _id: artist.id },
                            updateValue
                        );
                } catch (err) {
                    return new Error(err);
                } finally {
                    await session.commitTransaction();
                }
            },
        }
    },
});

export default new GraphQLSchema({ query: RootQuery, mutation: mutations });