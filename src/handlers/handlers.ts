import { GraphQLID, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { ArtistType, MapArtistToEventType, SigningEventType, UserType } from "../schema/schema";
import Artist from "../models/Artist";
import { Document, startSession } from "mongoose";
import User from "../models/User";
import SigningEvent from "../models/SigningEvent";
import { hashSync } from "bcrypt-nodejs";
import MapArtistToEvent from "../models/MapArtistToEvent";

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
        signingEvent: {
            type: GraphQLList(SigningEventType),
            async resolve() {
                return await SigningEvent.find();
            }
        },
        mapArtistToEvent: {
            type: GraphQLList(MapArtistToEventType),
            async resolve() {
                return await MapArtistToEvent.find();
            }
        },
        mapArtistToEventByEventId: {
            type: GraphQLList(MapArtistToEventType),
            args: { eventId: { type: GraphQLNonNull(GraphQLString)}},
            async resolve(parent, { eventId }) {
                return await MapArtistToEvent.find({ eventId: eventId }).sort({artistName: 1}).exec();
            },
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
                    existingUser = await User.findOne({ email });
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
                bluesky: { type: GraphQLString },
                omalink: { type: GraphQLString }
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
                    bluesky,
                    omalink
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
                            bluesky,
                            omalink
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
        },
        // add event
        signingEvent: {
            type: SigningEventType,
            args: {
                name: { type: GraphQLNonNull(GraphQLString) },
                city: { type: GraphQLNonNull(GraphQLString) },
                startDate: { type: GraphQLNonNull(GraphQLString) },
                endDate: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, {name, city, startDate, endDate}) {
                let existingEvent:DocumentType;
                try {
                    existingEvent = await SigningEvent.findOne({ name });
                    if(existingEvent) return new Error("Event already exists");
                    const newSigningEvent = new SigningEvent({name, city, startDate, endDate});
                    return await newSigningEvent.save();
                } catch (err) {
                    return new Error("Add Signing Event Failed. Try again.");
                }
            },
        },
        // add artist to event
        mapArtistToEvent: {
            type: MapArtistToEventType,
            args: {
                artistName: { type: GraphQLNonNull(GraphQLString) },
                eventId: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, {artistName, eventId}) {
                let existingArtistInEvent:DocumentType;
                try {
                    existingArtistInEvent = await MapArtistToEvent.findOne({ artistName, eventId });
                    if(existingArtistInEvent) return new Error("Artist already exists in event");
                    const newArtistInEvent = new MapArtistToEvent({artistName, eventId});
                    return await newArtistInEvent.save();
                } catch (err) {
                    return new Error("Add Artist to Event Failed. Try again.");
                }
            },
        },
    },
});

export default new GraphQLSchema({ query: RootQuery, mutation: mutations });