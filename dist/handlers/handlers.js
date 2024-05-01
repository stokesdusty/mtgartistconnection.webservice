"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
const schema_1 = require("../schema/schema");
const Artist_1 = __importDefault(require("../models/Artist"));
const mongoose_1 = require("mongoose");
const User_1 = __importDefault(require("../models/User"));
const SigningEvent_1 = __importDefault(require("../models/SigningEvent"));
const bcrypt_nodejs_1 = require("bcrypt-nodejs");
const MapArtistToEvent_1 = __importDefault(require("../models/MapArtistToEvent"));
const ObjectId = require('mongodb').ObjectID;
const RootQuery = new graphql_1.GraphQLObjectType({
    name: "RootQuery",
    fields: {
        // Get all artists
        artists: {
            type: (0, graphql_1.GraphQLList)(schema_1.ArtistType),
            async resolve() {
                return await Artist_1.default.find().sort({ name: 1 }).collation({ locale: "en", caseLevel: true });
            },
        },
        artistByName: {
            type: schema_1.ArtistType,
            args: { name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) } },
            async resolve(parent, { name }) {
                return await Artist_1.default.findOne({ name: name }).exec();
            },
        },
        users: {
            type: (0, graphql_1.GraphQLList)(schema_1.UserType),
            async resolve() {
                return await User_1.default.find();
            }
        },
        signingEvent: {
            type: (0, graphql_1.GraphQLList)(schema_1.SigningEventType),
            async resolve() {
                return await SigningEvent_1.default.find();
            }
        },
        mapArtistToEvent: {
            type: (0, graphql_1.GraphQLList)(schema_1.MapArtistToEventType),
            async resolve() {
                return await MapArtistToEvent_1.default.find();
            }
        },
        mapArtistToEventByEventId: {
            type: (0, graphql_1.GraphQLList)(schema_1.MapArtistToEventType),
            args: { eventId: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) } },
            async resolve(parent, { eventId }) {
                let _idObject = ObjectId(eventId);
                return await Artist_1.default.find({ eventId: _idObject }).exec();
            },
        },
    },
});
const mutations = new graphql_1.GraphQLObjectType({
    name: "mutations",
    fields: {
        // user signup
        signup: {
            type: schema_1.UserType,
            args: {
                name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                email: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                password: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
            },
            async resolve(parent, { name, email, password }) {
                let existingUser;
                try {
                    existingUser = await User_1.default.findOne({ email });
                    if (existingUser)
                        return new Error("User already exists");
                    const encryptedPassword = (0, bcrypt_nodejs_1.hashSync)(password);
                    const user = new User_1.default({ name, email, password: encryptedPassword });
                    return await user.save();
                }
                catch (err) {
                    return new Error("User Signup Failed. Try again.");
                }
            },
        },
        // user login
        login: {
            type: schema_1.UserType,
            args: {
                email: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                password: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
            },
            async resolve(parent, { email, password }) {
                let existingUser;
                try {
                    existingUser = await User_1.default.findOne({ email });
                    if (!existingUser)
                        return new Error("No User registered with this email");
                    // @ts-ignore
                    const decryptedPassword = compareSync(password, existingUser?.password);
                    if (!decryptedPassword)
                        return new Error("Incorrect Password");
                    return existingUser;
                }
                catch (err) {
                    return new Error(err);
                }
            },
        },
        // add artist
        addArtist: {
            type: schema_1.ArtistType,
            args: {
                name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                email: { type: graphql_1.GraphQLString },
                artistProofs: { type: graphql_1.GraphQLString },
                facebook: { type: graphql_1.GraphQLString },
                haveSignature: { type: graphql_1.GraphQLString },
                instagram: { type: graphql_1.GraphQLString },
                patreon: { type: graphql_1.GraphQLString },
                signing: { type: graphql_1.GraphQLString },
                signingComment: { type: graphql_1.GraphQLString },
                twitter: { type: graphql_1.GraphQLString },
                url: { type: graphql_1.GraphQLString },
                youtube: { type: graphql_1.GraphQLString },
                mountainmage: { type: graphql_1.GraphQLString },
                markssignatureservice: { type: graphql_1.GraphQLString },
                filename: { type: graphql_1.GraphQLString },
                artstation: { type: graphql_1.GraphQLString },
                location: { type: graphql_1.GraphQLString },
            },
            async resolve(parent, { name, email, artistProofs, facebook, haveSignature, instagram, patreon, signing, signingComment, twitter, url, youtube, mountainmage, markssignatureservice, filename, artstation, location, }) {
                let existingArtist;
                try {
                    existingArtist = await Artist_1.default.findOne({ name });
                    if (existingArtist)
                        return new Error("Artist already exists");
                    const artist = new Artist_1.default({
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
                }
                catch (err) {
                    return new Error("Artist Signup Failed. Try again.");
                }
            },
        },
        // delete artist
        deleteArtist: {
            type: schema_1.ArtistType,
            args: {
                id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
            },
            async resolve(parent, { id }) {
                const session = await (0, mongoose_1.startSession)();
                let artist;
                try {
                    session.startTransaction({ session });
                    artist = await Artist_1.default.findById(id);
                    if (!artist)
                        return new Error("Artist not found");
                    // @ts-ignore
                    return await Artist_1.default.findByIdAndDelete(artist.id);
                }
                catch (err) {
                    return new Error(err);
                }
                finally {
                    await session.commitTransaction();
                }
            },
        },
        deleteAllArtists: {
            type: (0, graphql_1.GraphQLList)(schema_1.ArtistType),
            async resolve(parent) {
                return await Artist_1.default.deleteMany({});
            }
        },
        updateArtist: {
            type: schema_1.ArtistType,
            args: {
                id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
                fieldName: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                valueToSet: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) }
            },
            async resolve(parent, { id, fieldName, valueToSet }) {
                const session = await (0, mongoose_1.startSession)();
                let artist;
                let updateValue = {};
                updateValue[fieldName] = valueToSet;
                try {
                    session.startTransaction({ session });
                    artist = await Artist_1.default.findById(id);
                    if (!artist)
                        return new Error("Artist not found");
                    return await Artist_1.default.findByIdAndUpdate({ _id: artist.id }, updateValue);
                }
                catch (err) {
                    return new Error(err);
                }
                finally {
                    await session.commitTransaction();
                }
            },
        },
        // add event
        signingEvent: {
            type: schema_1.SigningEventType,
            args: {
                name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                city: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                startDate: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                endDate: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
            },
            async resolve(parent, { name, city, startDate, endDate }) {
                let existingEvent;
                try {
                    existingEvent = await SigningEvent_1.default.findOne({ name });
                    if (existingEvent)
                        return new Error("Event already exists");
                    const newSigningEvent = new SigningEvent_1.default({ name, city, startDate, endDate });
                    return await newSigningEvent.save();
                }
                catch (err) {
                    return new Error("Add Signing Event Failed. Try again.");
                }
            },
        },
        // add artist to event
        mapArtistToEvent: {
            type: schema_1.MapArtistToEventType,
            args: {
                artistName: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                eventId: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
            },
            async resolve(parent, { artistName, eventId }) {
                let existingArtistInEvent;
                try {
                    existingArtistInEvent = await MapArtistToEvent_1.default.findOne({ artistName, eventId });
                    if (existingArtistInEvent)
                        return new Error("Artist already exists in event");
                    const newArtistInEvent = new MapArtistToEvent_1.default({ artistName, eventId });
                    return await newArtistInEvent.save();
                }
                catch (err) {
                    return new Error("Add Artist to Event Failed. Try again.");
                }
            },
        },
    },
});
exports.default = new graphql_1.GraphQLSchema({ query: RootQuery, mutation: mutations });
//# sourceMappingURL=handlers.js.map