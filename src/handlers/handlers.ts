import { GraphQLBoolean, GraphQLID, GraphQLInputObjectType, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { ArtistType, AuthResponseType, CardPriceType, CardKingdomPriceType, EmailPreferencesType, MapArtistToEventType, MutationResponseType, SigningEventType, UserType } from "../schema/schema";
import Artist from "../models/Artist";
import { Document, startSession } from "mongoose";
import User from "../models/User";
import SigningEvent from "../models/SigningEvent";
import { hashSync, compareSync } from "bcrypt-nodejs";
import MapArtistToEvent from "../models/MapArtistToEvent";
import CardPrice from "../models/CardPrice";
import CardKingdomPrice from "../models/CardKingdomPrice";
import ArtistChange from "../models/ArtistChange";
import EventChange from "../models/EventChange";
import { generateToken, requireAuth, requireAdmin } from "../middleware/auth";

type DocumentType = Document<any, any, any>;

const CardLookupInput = new GraphQLInputObjectType({
    name: "CardLookupInput",
    fields: {
        set_code: { type: GraphQLNonNull(GraphQLString) },
        number: { type: GraphQLNonNull(GraphQLString) },
    },
});

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
        artistById: {
            type: ArtistType,
            args: { id: { type: GraphQLNonNull(GraphQLID)}},
            async resolve(parent, { id }) {
                return await Artist.findById(id).exec();
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
        cardPricesByCards: {
            type: GraphQLList(CardPriceType),
            args: { cards: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(CardLookupInput))) }},
            async resolve(parent, { cards }) {
                const queries = cards.map((card: { set_code: string; number: string }) => ({
                    set_code: card.set_code.toUpperCase(),
                    number: card.number,
                }));

                return await CardPrice.find({ $or: queries }).exec();
            },
        },
        cardKingdomPricesByNames: {
            type: GraphQLList(CardKingdomPriceType),
            args: {
                names: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GraphQLString))) }
            },
            async resolve(parent, { names }) {
                // Get latest prices only (most recent fetch)
                const latestFetch = await CardKingdomPrice.findOne().sort({ fetchedAt: -1 }).select('fetchedAt').exec();

                const query: any = {
                    name: { $in: names.map((name: string) => new RegExp(`^${name}$`, 'i')) },
                    condition: 'NM',  // Only NM condition
                    foil: false,      // Non-foil only
                };

                if (latestFetch) {
                    query.fetchedAt = latestFetch.fetchedAt;
                }

                return await CardKingdomPrice.find(query).exec();
            },
        },
        cardKingdomPricesByScryfallIds: {
            type: GraphQLList(CardKingdomPriceType),
            args: {
                scryfallIds: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GraphQLString))) }
            },
            async resolve(parent, { scryfallIds }) {
                // Get latest prices only (most recent fetch)
                const latestFetch = await CardKingdomPrice.findOne().sort({ fetchedAt: -1 }).select('fetchedAt').exec();

                const query: any = {
                    scryfallId: { $in: scryfallIds },
                    condition: 'NM',  // Only NM condition
                    foil: false,      // Non-foil only
                };

                if (latestFetch) {
                    query.fetchedAt = latestFetch.fetchedAt;
                }

                return await CardKingdomPrice.find(query).exec();
            },
        },
        me: {
            type: UserType,
            async resolve(parent, args, context) {
                requireAuth(context.isAuthenticated);

                try {
                    const user = await User.findById(context.userId);
                    if (!user) {
                        throw new Error("User not found");
                    }
                    return user;
                } catch (err) {
                    throw new Error("Failed to fetch user data");
                }
            },
        },
    },
});

const mutations = new GraphQLObjectType({
    name: "mutations",
    fields: {
         // user signup
         signup: {
            type: AuthResponseType,
            args: {
                name: { type: GraphQLNonNull(GraphQLString) },
                email: { type: GraphQLNonNull(GraphQLString) },
                password: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, {name, email, password}) {
                let existingUser:DocumentType;
                try {
                    existingUser = await User.findOne({ email });
                    if(existingUser) throw new Error("User already exists");
                    const encryptedPassword = hashSync(password);
                    // Default role is 'user', will be set by model default
                    const user = new User({name, email, password: encryptedPassword});
                    const savedUser = await user.save();

                    // Generate JWT token with user role
                    // @ts-ignore
                    const token = generateToken(savedUser._id.toString(), savedUser.role);

                    return {
                        token,
                        user: savedUser
                    };
                } catch (err) {
                    throw new Error("User Signup Failed. Try again.");
                }
            },
        },
        // user login
        login: {
            type: AuthResponseType,
            args: {
                email: { type: GraphQLNonNull(GraphQLString) },
                password: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, {email, password}) {
                let existingUser:DocumentType;
                try {
                    existingUser = await User.findOne({email});
                    if (!existingUser) throw new Error("No User registered with this email");
                    // @ts-ignore
                    const decryptedPassword = compareSync(password, existingUser?.password);
                    if(!decryptedPassword) throw new Error("Incorrect Password");

                    // Generate JWT token with user role
                    // @ts-ignore
                    const token = generateToken(existingUser._id.toString(), existingUser.role);

                    return {
                        token,
                        user: existingUser
                    };
                } catch (err) {
                    throw new Error(err);
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
                omalink: { type: GraphQLString },
                inprnt: { type: GraphQLString },
                alternate_names: { type: GraphQLString }
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
                    omalink,
                    inprnt,
                    alternate_names
                },
                context
                ) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                let existingArtist:DocumentType;
                try {
                    existingArtist = await Artist.findOne({name});
                    if(existingArtist) throw new Error("Artist already exists");
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
                            omalink,
                            inprnt,
                            alternate_names
                        });
                    return await artist.save();
                } catch (err) {
                    throw new Error("Artist Signup Failed. Try again.");
                }
            },
        },
        // delete artist
        deleteArtist: {
            type: ArtistType,
            args: {
                id: { type: GraphQLNonNull(GraphQLID) },
            },
            async resolve(parent, { id }, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                const session = await startSession();
                let artist:DocumentType;
                try {
                    session.startTransaction({ session });
                    artist = await Artist.findById(id);
                    if (!artist) throw new Error("Artist not found");
                    // @ts-ignore
                    return await Artist.findByIdAndDelete(artist.id);
                } catch (err) {
                    throw new Error(err);
                } finally {
                    await session.commitTransaction();
                }
            },
        },
        deleteAllArtists: {
            type: GraphQLList(ArtistType),
            async resolve(parent, args, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

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
            async resolve(parent, { id, fieldName, valueToSet }, context){
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                const session = await startSession();
                let artist:DocumentType;
                let updateValue = {};
                updateValue[fieldName] = valueToSet;
                try {
                    session.startTransaction({session});
                    artist = await Artist.findById(id);
                    if (!artist) throw new Error("Artist not found");
                    return await Artist.findByIdAndUpdate(
                            { _id: artist.id },
                            updateValue
                        );
                } catch (err) {
                    throw new Error(err);
                } finally {
                    await session.commitTransaction();
                }
            },
        },
        updateArtistBulk: {
            type: ArtistType,
            args: {
                id: { type: GraphQLNonNull(GraphQLID) },
                name: { type: GraphQLString },
                email: { type: GraphQLString },
                artistProofs: { type: GraphQLString },
                facebook: { type: GraphQLString },
                instagram: { type: GraphQLString },
                twitter: { type: GraphQLString },
                patreon: { type: GraphQLString },
                youtube: { type: GraphQLString },
                artstation: { type: GraphQLString },
                bluesky: { type: GraphQLString },
                signing: { type: GraphQLString },
                signingComment: { type: GraphQLString },
                haveSignature: { type: GraphQLString },
                url: { type: GraphQLString },
                location: { type: GraphQLString },
                filename: { type: GraphQLString },
                mountainmage: { type: GraphQLString },
                markssignatureservice: { type: GraphQLString },
                omalink: { type: GraphQLString },
                inprnt: { type: GraphQLString },
                alternate_names: { type: GraphQLString },
            },
            async resolve(parent, args, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                const { id, ...updateFields } = args;

                try {
                    // Fetch current artist to compare changes
                    const currentArtist = await Artist.findById(id);
                    if (!currentArtist) throw new Error("Artist not found");

                    // Track which fields changed
                    const fieldsChanged: string[] = [];
                    const updateData: any = {};

                    for (const [key, value] of Object.entries(updateFields)) {
                        if (value !== undefined && value !== null) {
                            updateData[key] = value;
                            if (currentArtist[key] !== value) {
                                fieldsChanged.push(key);
                            }
                        }
                    }

                    // Update the artist
                    const updatedArtist = await Artist.findByIdAndUpdate(
                        id,
                        { $set: updateData },
                        { new: true }
                    );

                    // Create ArtistChange record if fields actually changed
                    if (fieldsChanged.length > 0) {
                        await ArtistChange.create({
                            artistName: updatedArtist.name,
                            changeType: 'update',
                            fieldsChanged: fieldsChanged,
                            timestamp: new Date(),
                            processed: false
                        });
                    }

                    return updatedArtist;
                } catch (err) {
                    throw new Error(err.message || "Update artist failed");
                }
            },
        },
        // add event
        signingEvent: {
            type: SigningEventType,
            args: {
                name: { type: GraphQLNonNull(GraphQLString) },
                city: { type: GraphQLNonNull(GraphQLString) },
                state: { type: GraphQLString },
                startDate: { type: GraphQLNonNull(GraphQLString) },
                endDate: { type: GraphQLNonNull(GraphQLString) },
                url: { type: GraphQLString },
            },
            async resolve(parent, {name, city, state, startDate, endDate, url}, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                let existingEvent:DocumentType;
                try {
                    existingEvent = await SigningEvent.findOne({ name });
                    if(existingEvent) throw new Error("Event already exists");
                    const newSigningEvent = new SigningEvent({name, city, state, startDate, endDate, url});
                    const savedEvent = await newSigningEvent.save();

                    // Track event creation for email notifications if state is provided
                    if (state) {
                        await EventChange.create({
                            eventId: savedEvent._id,
                            eventName: name,
                            city: city,
                            state: state,
                            startDate: new Date(startDate),
                            endDate: new Date(endDate),
                            url: url || null,
                            changeType: 'new_event',
                            timestamp: new Date(),
                            processed: false
                        });
                    }

                    return savedEvent;
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
            async resolve(parent, {artistName, eventId}, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                let existingArtistInEvent:DocumentType;
                try {
                    existingArtistInEvent = await MapArtistToEvent.findOne({ artistName, eventId });
                    if(existingArtistInEvent) throw new Error("Artist already exists in event");
                    const newArtistInEvent = new MapArtistToEvent({artistName, eventId});
                    const result = await newArtistInEvent.save();

                    // Track change for email digest
                    const event = await SigningEvent.findById(eventId);
                    if (event) {
                        // Create ArtistChange for users following this artist
                        await ArtistChange.create({
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

                        // Create EventChange for users monitoring this state
                        if (event.state) {
                            await EventChange.create({
                                eventId: event._id,
                                eventName: event.name,
                                city: event.city,
                                state: event.state,
                                startDate: event.startDate,
                                endDate: event.endDate,
                                url: event.url || null,
                                changeType: 'artist_added',
                                artistName: artistName,
                                timestamp: new Date(),
                                processed: false
                            });
                        }
                    }

                    return result;
                } catch (err) {
                    throw new Error("Add Artist to Event Failed. Try again.");
                }
            },
        },
        // update password
        updatePassword: {
            type: MutationResponseType,
            args: {
                currentPassword: { type: GraphQLNonNull(GraphQLString) },
                newPassword: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, {currentPassword, newPassword}, context) {
                // Require authentication
                requireAuth(context.isAuthenticated);

                try {
                    const user = await User.findById(context.userId);
                    if (!user) {
                        return {
                            success: false,
                            message: "User not found"
                        };
                    }

                    // Verify current password
                    // @ts-ignore
                    const isPasswordValid = compareSync(currentPassword, user.password);
                    if (!isPasswordValid) {
                        return {
                            success: false,
                            message: "Current password is incorrect"
                        };
                    }

                    // Hash and update new password
                    const encryptedPassword = hashSync(newPassword);
                    // @ts-ignore
                    user.password = encryptedPassword;
                    await user.save();

                    return {
                        success: true,
                        message: "Password updated successfully"
                    };
                } catch (err) {
                    return {
                        success: false,
                        message: "Failed to update password"
                    };
                }
            },
        },
        // update email preferences
        updateEmailPreferences: {
            type: MutationResponseType,
            args: {
                siteUpdates: { type: GraphQLNonNull(GraphQLBoolean) },
                artistUpdates: { type: GraphQLNonNull(GraphQLBoolean) },
                localSigningEvents: { type: GraphQLNonNull(GraphQLBoolean) },
            },
            async resolve(parent, {siteUpdates, artistUpdates, localSigningEvents}, context) {
                // Require authentication
                requireAuth(context.isAuthenticated);

                try {
                    const user = await User.findById(context.userId);
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
                } catch (err) {
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
            type: MutationResponseType,
            args: {
                artistName: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, { artistName }, context) {
                // Require authentication
                requireAuth(context.isAuthenticated);

                try {
                    const user = await User.findById(context.userId);
                    if (!user) {
                        return {
                            success: false,
                            message: "User not found"
                        };
                    }

                    // Check if artist exists
                    const artist = await Artist.findOne({ name: artistName });
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
                } catch (err) {
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
            type: MutationResponseType,
            args: {
                artistName: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, { artistName }, context) {
                // Require authentication
                requireAuth(context.isAuthenticated);

                try {
                    const user = await User.findById(context.userId);
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
                    user.followedArtists = user.followedArtists.filter(
                        (name: string) => name !== artistName
                    );
                    await user.save();

                    return {
                        success: true,
                        message: "Successfully unfollowed artist"
                    };
                } catch (err) {
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
            type: MutationResponseType,
            args: {
                state: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, { state }, context) {
                // Require authentication
                requireAuth(context.isAuthenticated);

                try {
                    const user = await User.findById(context.userId);
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
                } catch (err) {
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
            type: MutationResponseType,
            args: {
                state: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, { state }, context) {
                // Require authentication
                requireAuth(context.isAuthenticated);

                try {
                    const user = await User.findById(context.userId);
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
                    user.monitoredStates = user.monitoredStates.filter(
                        (s: string) => s !== state
                    );
                    await user.save();

                    return {
                        success: true,
                        message: "Successfully removed state from monitoring"
                    };
                } catch (err) {
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

export default new GraphQLSchema({ query: RootQuery, mutation: mutations });