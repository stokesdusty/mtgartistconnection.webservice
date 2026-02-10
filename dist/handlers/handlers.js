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
const CardPrice_1 = __importDefault(require("../models/CardPrice"));
const ArtistChange_1 = __importDefault(require("../models/ArtistChange"));
const auth_1 = require("../middleware/auth");
const CardLookupInput = new graphql_1.GraphQLInputObjectType({
    name: "CardLookupInput",
    fields: {
        set_code: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        number: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
    },
});
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
        artistById: {
            type: schema_1.ArtistType,
            args: { id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) } },
            async resolve(parent, { id }) {
                return await Artist_1.default.findById(id).exec();
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
            args: { eventId: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) } },
            async resolve(parent, { eventId }) {
                return await MapArtistToEvent_1.default.find({ eventId: eventId }).sort({ artistName: 1 }).exec();
            },
        },
        cardPricesByCards: {
            type: (0, graphql_1.GraphQLList)(schema_1.CardPriceType),
            args: { cards: { type: (0, graphql_1.GraphQLNonNull)((0, graphql_1.GraphQLList)((0, graphql_1.GraphQLNonNull)(CardLookupInput))) } },
            async resolve(parent, { cards }) {
                const queries = cards.map((card) => ({
                    set_code: card.set_code.toUpperCase(),
                    number: card.number,
                }));
                return await CardPrice_1.default.find({ $or: queries }).exec();
            },
        },
        me: {
            type: schema_1.UserType,
            async resolve(parent, args, context) {
                (0, auth_1.requireAuth)(context.isAuthenticated);
                try {
                    const user = await User_1.default.findById(context.userId);
                    if (!user) {
                        throw new Error("User not found");
                    }
                    return user;
                }
                catch (err) {
                    throw new Error("Failed to fetch user data");
                }
            },
        },
    },
});
const mutations = new graphql_1.GraphQLObjectType({
    name: "mutations",
    fields: {
        // user signup
        signup: {
            type: schema_1.AuthResponseType,
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
                        throw new Error("User already exists");
                    const encryptedPassword = (0, bcrypt_nodejs_1.hashSync)(password);
                    // Default role is 'user', will be set by model default
                    const user = new User_1.default({ name, email, password: encryptedPassword });
                    const savedUser = await user.save();
                    // Generate JWT token with user role
                    // @ts-ignore
                    const token = (0, auth_1.generateToken)(savedUser._id.toString(), savedUser.role);
                    return {
                        token,
                        user: savedUser
                    };
                }
                catch (err) {
                    throw new Error("User Signup Failed. Try again.");
                }
            },
        },
        // user login
        login: {
            type: schema_1.AuthResponseType,
            args: {
                email: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                password: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
            },
            async resolve(parent, { email, password }) {
                let existingUser;
                try {
                    existingUser = await User_1.default.findOne({ email });
                    if (!existingUser)
                        throw new Error("No User registered with this email");
                    // @ts-ignore
                    const decryptedPassword = (0, bcrypt_nodejs_1.compareSync)(password, existingUser?.password);
                    if (!decryptedPassword)
                        throw new Error("Incorrect Password");
                    // Generate JWT token with user role
                    // @ts-ignore
                    const token = (0, auth_1.generateToken)(existingUser._id.toString(), existingUser.role);
                    return {
                        token,
                        user: existingUser
                    };
                }
                catch (err) {
                    throw new Error(err);
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
                bluesky: { type: graphql_1.GraphQLString },
                omalink: { type: graphql_1.GraphQLString },
                inprnt: { type: graphql_1.GraphQLString }
            },
            async resolve(parent, { name, email, artistProofs, facebook, haveSignature, instagram, patreon, signing, signingComment, twitter, url, youtube, mountainmage, markssignatureservice, filename, artstation, location, bluesky, omalink, inprnt }, context) {
                // Require admin privileges
                (0, auth_1.requireAdmin)(context.isAuthenticated, context.userRole);
                let existingArtist;
                try {
                    existingArtist = await Artist_1.default.findOne({ name });
                    if (existingArtist)
                        throw new Error("Artist already exists");
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
                        bluesky,
                        omalink,
                        inprnt
                    });
                    return await artist.save();
                }
                catch (err) {
                    throw new Error("Artist Signup Failed. Try again.");
                }
            },
        },
        // delete artist
        deleteArtist: {
            type: schema_1.ArtistType,
            args: {
                id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
            },
            async resolve(parent, { id }, context) {
                // Require admin privileges
                (0, auth_1.requireAdmin)(context.isAuthenticated, context.userRole);
                const session = await (0, mongoose_1.startSession)();
                let artist;
                try {
                    session.startTransaction({ session });
                    artist = await Artist_1.default.findById(id);
                    if (!artist)
                        throw new Error("Artist not found");
                    // @ts-ignore
                    return await Artist_1.default.findByIdAndDelete(artist.id);
                }
                catch (err) {
                    throw new Error(err);
                }
                finally {
                    await session.commitTransaction();
                }
            },
        },
        deleteAllArtists: {
            type: (0, graphql_1.GraphQLList)(schema_1.ArtistType),
            async resolve(parent, args, context) {
                // Require admin privileges
                (0, auth_1.requireAdmin)(context.isAuthenticated, context.userRole);
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
            async resolve(parent, { id, fieldName, valueToSet }, context) {
                // Require admin privileges
                (0, auth_1.requireAdmin)(context.isAuthenticated, context.userRole);
                const session = await (0, mongoose_1.startSession)();
                let artist;
                let updateValue = {};
                updateValue[fieldName] = valueToSet;
                try {
                    session.startTransaction({ session });
                    artist = await Artist_1.default.findById(id);
                    if (!artist)
                        throw new Error("Artist not found");
                    return await Artist_1.default.findByIdAndUpdate({ _id: artist.id }, updateValue);
                }
                catch (err) {
                    throw new Error(err);
                }
                finally {
                    await session.commitTransaction();
                }
            },
        },
        updateArtistBulk: {
            type: schema_1.ArtistType,
            args: {
                id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
                name: { type: graphql_1.GraphQLString },
                email: { type: graphql_1.GraphQLString },
                artistProofs: { type: graphql_1.GraphQLString },
                facebook: { type: graphql_1.GraphQLString },
                instagram: { type: graphql_1.GraphQLString },
                twitter: { type: graphql_1.GraphQLString },
                patreon: { type: graphql_1.GraphQLString },
                youtube: { type: graphql_1.GraphQLString },
                artstation: { type: graphql_1.GraphQLString },
                bluesky: { type: graphql_1.GraphQLString },
                signing: { type: graphql_1.GraphQLString },
                signingComment: { type: graphql_1.GraphQLString },
                haveSignature: { type: graphql_1.GraphQLString },
                url: { type: graphql_1.GraphQLString },
                location: { type: graphql_1.GraphQLString },
                filename: { type: graphql_1.GraphQLString },
                mountainmage: { type: graphql_1.GraphQLString },
                markssignatureservice: { type: graphql_1.GraphQLString },
                omalink: { type: graphql_1.GraphQLString },
                inprnt: { type: graphql_1.GraphQLString },
            },
            async resolve(parent, args, context) {
                // Require admin privileges
                (0, auth_1.requireAdmin)(context.isAuthenticated, context.userRole);
                const { id, ...updateFields } = args;
                try {
                    // Fetch current artist to compare changes
                    const currentArtist = await Artist_1.default.findById(id);
                    if (!currentArtist)
                        throw new Error("Artist not found");
                    // Track which fields changed
                    const fieldsChanged = [];
                    const updateData = {};
                    for (const [key, value] of Object.entries(updateFields)) {
                        if (value !== undefined && value !== null) {
                            updateData[key] = value;
                            if (currentArtist[key] !== value) {
                                fieldsChanged.push(key);
                            }
                        }
                    }
                    // Update the artist
                    const updatedArtist = await Artist_1.default.findByIdAndUpdate(id, { $set: updateData }, { new: true });
                    // Create ArtistChange record if fields actually changed
                    if (fieldsChanged.length > 0) {
                        await ArtistChange_1.default.create({
                            artistName: updatedArtist.name,
                            changeType: 'update',
                            fieldsChanged: fieldsChanged,
                            timestamp: new Date(),
                            processed: false
                        });
                    }
                    return updatedArtist;
                }
                catch (err) {
                    throw new Error(err.message || "Update artist failed");
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
                url: { type: graphql_1.GraphQLString },
            },
            async resolve(parent, { name, city, startDate, endDate, url }, context) {
                // Require admin privileges
                (0, auth_1.requireAdmin)(context.isAuthenticated, context.userRole);
                let existingEvent;
                try {
                    existingEvent = await SigningEvent_1.default.findOne({ name });
                    if (existingEvent)
                        throw new Error("Event already exists");
                    const newSigningEvent = new SigningEvent_1.default({ name, city, startDate, endDate, url });
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
            async resolve(parent, { artistName, eventId }, context) {
                // Require admin privileges
                (0, auth_1.requireAdmin)(context.isAuthenticated, context.userRole);
                let existingArtistInEvent;
                try {
                    existingArtistInEvent = await MapArtistToEvent_1.default.findOne({ artistName, eventId });
                    if (existingArtistInEvent)
                        throw new Error("Artist already exists in event");
                    const newArtistInEvent = new MapArtistToEvent_1.default({ artistName, eventId });
                    const result = await newArtistInEvent.save();
                    // Track change for email digest
                    const event = await SigningEvent_1.default.findById(eventId);
                    if (event) {
                        await ArtistChange_1.default.create({
                            artistName: artistName,
                            changeType: 'added_to_event',
                            eventId: event._id,
                            eventName: event.name,
                            eventStartDate: event.startDate,
                            eventEndDate: event.endDate,
                            eventLocation: `${event.city}${event.state ? ', ' + event.state : ''}${event.country ? ', ' + event.country : ''}`,
                            timestamp: new Date(),
                            processed: false
                        });
                    }
                    return result;
                }
                catch (err) {
                    throw new Error("Add Artist to Event Failed. Try again.");
                }
            },
        },
        // update password
        updatePassword: {
            type: schema_1.MutationResponseType,
            args: {
                currentPassword: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                newPassword: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
            },
            async resolve(parent, { currentPassword, newPassword }, context) {
                // Require authentication
                (0, auth_1.requireAuth)(context.isAuthenticated);
                try {
                    const user = await User_1.default.findById(context.userId);
                    if (!user) {
                        return {
                            success: false,
                            message: "User not found"
                        };
                    }
                    // Verify current password
                    // @ts-ignore
                    const isPasswordValid = (0, bcrypt_nodejs_1.compareSync)(currentPassword, user.password);
                    if (!isPasswordValid) {
                        return {
                            success: false,
                            message: "Current password is incorrect"
                        };
                    }
                    // Hash and update new password
                    const encryptedPassword = (0, bcrypt_nodejs_1.hashSync)(newPassword);
                    // @ts-ignore
                    user.password = encryptedPassword;
                    await user.save();
                    return {
                        success: true,
                        message: "Password updated successfully"
                    };
                }
                catch (err) {
                    return {
                        success: false,
                        message: "Failed to update password"
                    };
                }
            },
        },
        // update email preferences
        updateEmailPreferences: {
            type: schema_1.MutationResponseType,
            args: {
                siteUpdates: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLBoolean) },
                artistUpdates: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLBoolean) },
                localSigningEvents: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLBoolean) },
            },
            async resolve(parent, { siteUpdates, artistUpdates, localSigningEvents }, context) {
                // Require authentication
                (0, auth_1.requireAuth)(context.isAuthenticated);
                try {
                    const user = await User_1.default.findById(context.userId);
                    if (!user) {
                        return {
                            success: false,
                            message: "User not found"
                        };
                    }
                    // Update email preferences using set to ensure proper nested object update
                    // @ts-ignore
                    user.set('emailPreferences.siteUpdates', siteUpdates);
                    // @ts-ignore
                    user.set('emailPreferences.artistUpdates', artistUpdates);
                    // @ts-ignore
                    user.set('emailPreferences.localSigningEvents', localSigningEvents);
                    // Mark the nested field as modified
                    // @ts-ignore
                    user.markModified('emailPreferences');
                    await user.save();
                    return {
                        success: true,
                        message: "Email preferences updated successfully"
                    };
                }
                catch (err) {
                    console.error("Error updating email preferences:", err);
                    return {
                        success: false,
                        message: "Failed to update email preferences"
                    };
                }
            },
        },
        // follow artist
        followArtist: {
            type: schema_1.MutationResponseType,
            args: {
                artistName: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
            },
            async resolve(parent, { artistName }, context) {
                // Require authentication
                (0, auth_1.requireAuth)(context.isAuthenticated);
                try {
                    const user = await User_1.default.findById(context.userId);
                    if (!user) {
                        return {
                            success: false,
                            message: "User not found"
                        };
                    }
                    // Check if artist exists
                    const artist = await Artist_1.default.findOne({ name: artistName });
                    if (!artist) {
                        return {
                            success: false,
                            message: "Artist not found"
                        };
                    }
                    // @ts-ignore
                    if (!user.followedArtists) {
                        // @ts-ignore
                        user.followedArtists = [];
                    }
                    // Check if already following
                    // @ts-ignore
                    if (user.followedArtists.includes(artistName)) {
                        return {
                            success: false,
                            message: "Already following this artist"
                        };
                    }
                    // Add artist to followed list
                    // @ts-ignore
                    user.followedArtists.push(artistName);
                    await user.save();
                    return {
                        success: true,
                        message: "Successfully followed artist"
                    };
                }
                catch (err) {
                    console.error("Error following artist:", err);
                    return {
                        success: false,
                        message: "Failed to follow artist"
                    };
                }
            },
        },
        // unfollow artist
        unfollowArtist: {
            type: schema_1.MutationResponseType,
            args: {
                artistName: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
            },
            async resolve(parent, { artistName }, context) {
                // Require authentication
                (0, auth_1.requireAuth)(context.isAuthenticated);
                try {
                    const user = await User_1.default.findById(context.userId);
                    if (!user) {
                        return {
                            success: false,
                            message: "User not found"
                        };
                    }
                    // @ts-ignore
                    if (!user.followedArtists || !user.followedArtists.includes(artistName)) {
                        return {
                            success: false,
                            message: "Not following this artist"
                        };
                    }
                    // Remove artist from followed list
                    // @ts-ignore
                    user.followedArtists = user.followedArtists.filter((name) => name !== artistName);
                    await user.save();
                    return {
                        success: true,
                        message: "Successfully unfollowed artist"
                    };
                }
                catch (err) {
                    console.error("Error unfollowing artist:", err);
                    return {
                        success: false,
                        message: "Failed to unfollow artist"
                    };
                }
            },
        },
        // monitor state for events
        monitorState: {
            type: schema_1.MutationResponseType,
            args: {
                state: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
            },
            async resolve(parent, { state }, context) {
                // Require authentication
                (0, auth_1.requireAuth)(context.isAuthenticated);
                try {
                    const user = await User_1.default.findById(context.userId);
                    if (!user) {
                        return {
                            success: false,
                            message: "User not found"
                        };
                    }
                    // @ts-ignore
                    if (!user.monitoredStates) {
                        // @ts-ignore
                        user.monitoredStates = [];
                    }
                    // Check if already monitoring
                    // @ts-ignore
                    if (user.monitoredStates.includes(state)) {
                        return {
                            success: false,
                            message: "Already monitoring this state"
                        };
                    }
                    // Add state to monitored list
                    // @ts-ignore
                    user.monitoredStates.push(state);
                    // Automatically enable localSigningEvents email preference
                    // @ts-ignore
                    user.set('emailPreferences.localSigningEvents', true);
                    // @ts-ignore
                    user.markModified('emailPreferences');
                    await user.save();
                    return {
                        success: true,
                        message: "Successfully added state to monitoring"
                    };
                }
                catch (err) {
                    console.error("Error monitoring state:", err);
                    return {
                        success: false,
                        message: "Failed to monitor state"
                    };
                }
            },
        },
        // unmonitor state
        unmonitorState: {
            type: schema_1.MutationResponseType,
            args: {
                state: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
            },
            async resolve(parent, { state }, context) {
                // Require authentication
                (0, auth_1.requireAuth)(context.isAuthenticated);
                try {
                    const user = await User_1.default.findById(context.userId);
                    if (!user) {
                        return {
                            success: false,
                            message: "User not found"
                        };
                    }
                    // @ts-ignore
                    if (!user.monitoredStates || !user.monitoredStates.includes(state)) {
                        return {
                            success: false,
                            message: "Not monitoring this state"
                        };
                    }
                    // Remove state from monitored list
                    // @ts-ignore
                    user.monitoredStates = user.monitoredStates.filter((s) => s !== state);
                    await user.save();
                    return {
                        success: true,
                        message: "Successfully removed state from monitoring"
                    };
                }
                catch (err) {
                    console.error("Error unmonitoring state:", err);
                    return {
                        success: false,
                        message: "Failed to unmonitor state"
                    };
                }
            },
        },
    },
});
exports.default = new graphql_1.GraphQLSchema({ query: RootQuery, mutation: mutations });
//# sourceMappingURL=handlers.js.map