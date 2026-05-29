import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInputObjectType, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { ArtistType, ArtistFlagsType, ArtistPageType, ArtistPostType, AuthResponseType, RefreshTokenResponseType, CardPriceType, CardKingdomPriceType, EmailPreferencesType, MapArtistToEventType, MutationResponseType, NewsReviewType, PresignedUrlType, SigningBatchType, SigningEventType, UserCardCollectionItemType, UserType } from "../schema/schema";
import Artist from "../models/Artist";
import { Document, startSession } from "mongoose";
import User from "../models/User";
import UserCardCollection from "../models/UserCardCollection";
import SigningEvent from "../models/SigningEvent";
import { hashSync, compareSync } from "bcrypt-nodejs";
import MapArtistToEvent from "../models/MapArtistToEvent";
import CardPrice from "../models/CardPrice";
import CardKingdomPrice from "../models/CardKingdomPrice";
import ArtistChange from "../models/ArtistChange";
import EventChange from "../models/EventChange";
import ArtistPost from "../models/ArtistPost";
import NewsReview from "../models/NewsReview";
import SigningBatch from "../models/SigningBatch";
import LinkClick from "../models/LinkClick";
import PriceClick from "../models/PriceClick";
import { generateToken, generateRefreshToken, verifyRefreshToken, requireAuth, requireAdmin } from "../middleware/auth";
import { sendWelcomeEmail } from "../services/emailService";
import { generateNewsArticle } from "../services/aiNewsService";
import { uploadImageFromBase64 } from "../services/s3UploadService";

type DocumentType = Document<any, any, any>;

const CardLookupInput = new GraphQLInputObjectType({
    name: "CardLookupInput",
    fields: {
        set_code: { type: GraphQLNonNull(GraphQLString) },
        number: { type: GraphQLNonNull(GraphQLString) },
    },
});

const CardRowInput = new GraphQLInputObjectType({
    name: "CardRowInput",
    fields: {
        rowId:             { type: GraphQLNonNull(GraphQLString) },
        cardName:          { type: GraphQLString },
        quantity:          { type: GraphQLInt },
        set:               { type: GraphQLString },
        foil:              { type: GraphQLString },
        owner:             { type: GraphQLString },
        artist:            { type: GraphQLString },
        signatureType:     { type: GraphQLString },
        sigNotes:          { type: GraphQLString },
        pricePerSig:       { type: GraphQLFloat },
        paymentStatus:     { type: GraphQLString },
        status:            { type: GraphQLString },
        signingMethod:     { type: GraphQLString },
        signingMethodLabel:{ type: GraphQLString },
        outboundTracking:  { type: GraphQLString },
        inboundTracking:   { type: GraphQLString },
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
        // Paginated list — display fields only (name, filename). Use alongside artistFilterFlags.
        artistsPage: {
            type: GraphQLNonNull(ArtistPageType),
            args: {
                offset: { type: GraphQLInt },
                limit:  { type: GraphQLInt },
            },
            async resolve(_parent, { offset = 0, limit = 60 }) {
                const safeLimit = Math.min(Math.max(1, limit), 120);
                const [artists, total] = await Promise.all([
                    Artist.find()
                        .select('name filename')
                        .sort({ name: 1 })
                        .collation({ locale: 'en', caseLevel: true })
                        .skip(offset)
                        .limit(safeLimit)
                        .lean(),
                    Artist.countDocuments(),
                ]);
                return { artists, total };
            },
        },
        // Lightweight filter index — one packed bitfield per artist instead of four string fields.
        // Bit 0: markssignatureservice === "true"
        // Bit 1: mountainmage truthy (non-empty, not "false")
        // Bit 2: artistProofs === "yes" | "true"
        artistFilterFlags: {
            type: GraphQLNonNull(GraphQLList(GraphQLNonNull(ArtistFlagsType))),
            async resolve() {
                const artists = await Artist.find()
                    .select('name location alternate_names markssignatureservice mountainmage artistProofs')
                    .sort({ name: 1 })
                    .collation({ locale: 'en', caseLevel: true })
                    .lean();
                return artists.map((a: any) => {
                    let flags = 0;
                    if (a.markssignatureservice === 'true') flags |= 1;
                    if (a.mountainmage && a.mountainmage !== '' && a.mountainmage !== 'false') flags |= 2;
                    if (a.artistProofs === 'yes' || a.artistProofs === 'true') flags |= 4;
                    return { name: a.name, flags, location: a.location ?? null, alternate_names: a.alternate_names ?? null };
                });
            },
        },
        artistByName: {
            type: ArtistType,
            args: { name: { type: GraphQLNonNull(GraphQLString)}},
            async resolve(parent, { name }) {
                return await Artist.findOne({ name: name }).collation({ locale: 'en', strength: 1 }).exec();
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
        artistsByEventIds: {
            type: GraphQLList(MapArtistToEventType),
            args: { eventIds: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GraphQLString))) }},
            async resolve(parent, { eventIds }) {
                return await MapArtistToEvent.find({ eventId: { $in: eventIds } }).sort({artistName: 1}).exec();
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
        signingBatches: {
            type: GraphQLList(SigningBatchType),
            async resolve(parent, args, context) {
                requireAuth(context.isAuthenticated);
                return await SigningBatch.find({ userId: context.userId }).sort({ sortOrder: 1, createdAt: 1 });
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
        artistPosts: {
            type: GraphQLList(ArtistPostType),
            args: {
                isReviewed: { type: GraphQLBoolean },
                limit: { type: GraphQLInt, defaultValue: 50 }
            },
            async resolve(parent, { isReviewed, limit }, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
                const query: any = {};
                if (isReviewed !== undefined) query.isReviewed = isReviewed;
                return await ArtistPost.find(query).sort({ postDate: -1 }).limit(limit);
            }
        },
        newsReviews: {
            type: GraphQLList(NewsReviewType),
            args: {
                isReviewed: { type: GraphQLBoolean },
                isPublished: { type: GraphQLBoolean },
                limit: { type: GraphQLInt, defaultValue: 50 }
            },
            async resolve(parent, { isReviewed, isPublished, limit }, context) {
                // Allow public access for published articles only
                if (isPublished === true && isReviewed === undefined) {
                    const query: any = { isPublished: true };
                    return await NewsReview.find(query).sort({ publishedAt: -1 }).limit(limit);
                }
                // Require admin for other queries
                requireAdmin(context.isAuthenticated, context.userRole);
                const query: any = {};
                if (isReviewed !== undefined) query.isReviewed = isReviewed;
                if (isPublished !== undefined) query.isPublished = isPublished;
                return await NewsReview.find(query).sort({ generatedAt: -1 }).limit(limit);
            }
        },
        newsReview: {
            type: NewsReviewType,
            args: {
                id: { type: GraphQLNonNull(GraphQLID) }
            },
            async resolve(parent, { id }, context) {
                const article = await NewsReview.findById(id);
                // Only return if published (public access) or user is admin
                if (article && article.isPublished) {
                    return article;
                }
                // Require admin for unpublished articles
                requireAdmin(context.isAuthenticated, context.userRole);
                return article;
            }
        },
        newsReviewsByArtist: {
            type: GraphQLList(NewsReviewType),
            args: {
                artistName: { type: GraphQLNonNull(GraphQLString) },
                limit: { type: GraphQLInt, defaultValue: 50 }
            },
            async resolve(parent, { artistName, limit }, context) {
                // Public access - only return published articles for the artist
                const query = {
                    artistName: { $regex: new RegExp(`^${artistName}$`, 'i') },
                    isPublished: true
                };
                return await NewsReview.find(query).sort({ publishedAt: -1 }).limit(limit);
            }
        },
        userCardCollection: {
            type: GraphQLList(UserCardCollectionItemType),
            args: {
                scryfallIds: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GraphQLString))) },
            },
            async resolve(parent, { scryfallIds }, context) {
                requireAuth(context.isAuthenticated);
                return await UserCardCollection.find({
                    userId: context.userId,
                    scryfallId: { $in: scryfallIds },
                });
            },
        },
        myCardCollection: {
            type: GraphQLList(UserCardCollectionItemType),
            async resolve(parent, args, context) {
                requireAuth(context.isAuthenticated);
                return await UserCardCollection.find({
                    userId: context.userId,
                    $or: [
                        { signedNonfoil: true },
                        { signedFoil: true },
                        { wishlistSigned: true },
                        { artistProof: true },
                        { artistProofFoil: true },
                    ],
                });
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
                    // @ts-ignore
                    const refreshToken = generateRefreshToken(savedUser._id.toString(), savedUser.role);

                    // Send welcome email (async, don't wait for it)
                    sendWelcomeEmail(email).catch(err => {
                        console.error('Failed to send welcome email:', err);
                    });

                    return {
                        token,
                        refreshToken,
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
                    // @ts-ignore
                    const refreshToken = generateRefreshToken(existingUser._id.toString(), existingUser.role);

                    return {
                        token,
                        refreshToken,
                        user: existingUser
                    };
                } catch (err) {
                    throw new Error(err);
                }
            },
        },
        refreshToken: {
            type: RefreshTokenResponseType,
            args: {
                refreshToken: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, { refreshToken }) {
                try {
                    const decoded = verifyRefreshToken(refreshToken);
                    const token = generateToken(decoded.userId, decoded.role);
                    return { token };
                } catch (err) {
                    throw new Error("Invalid or expired refresh token. Please log in again.");
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
                    const savedArtist = await artist.save();

                    // Create ArtistChange record for new artist notification
                    await ArtistChange.create({
                        artistName: name,
                        changeType: 'new_artist',
                        timestamp: new Date(),
                        processed: false
                    });

                    return savedArtist;
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
                scryfall_name: { type: GraphQLString },
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
                newArtistNotifications: { type: GraphQLNonNull(GraphQLBoolean) },
            },
            async resolve(parent, {siteUpdates, artistUpdates, localSigningEvents, newArtistNotifications}, context) {
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
                    // @ts-ignore
                    user.set('emailPreferences.newArtistNotifications', newArtistNotifications);

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
        // Update an artist post (e.g., mark as reviewed)
        updateArtistPost: {
            type: MutationResponseType,
            args: {
                id: { type: GraphQLNonNull(GraphQLID) },
                isReviewed: { type: GraphQLNonNull(GraphQLBoolean) },
            },
            async resolve(parent, { id, isReviewed }, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                try {
                    const post = await ArtistPost.findByIdAndUpdate(
                        id,
                        { $set: { isReviewed } },
                        { new: true }
                    );
                    if (!post) throw new Error("Post not found");

                    return {
                        success: true,
                        message: "Post updated successfully"
                    };
                } catch (err) {
                    return {
                        success: false,
                        message: err.message || "Update post failed"
                    };
                }
            },
        },
        // Delete a specific social media post
        deleteArtistPost: {
            type: MutationResponseType,
            args: {
                id: { type: GraphQLNonNull(GraphQLID) },
            },
            async resolve(parent, { id }, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                try {
                    const result = await ArtistPost.findByIdAndDelete(id);
                    if (!result) throw new Error("Post not found");
                    
                    return { success: true, message: "Post deleted successfully" };
                } catch (err) {
                    return { success: false, message: err.message || "Failed to delete post" };
                }
            }
        },
        // Delete all posts that have been marked as reviewed
        deleteReviewedArtistPosts: {
            type: MutationResponseType,
            async resolve(parent, args, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                try {
                    const result = await ArtistPost.deleteMany({ isReviewed: true });
                    return {
                        success: true,
                        message: `Successfully deleted ${result.deletedCount} reviewed posts`
                    };
                } catch (err) {
                    return {
                        success: false,
                        message: err.message || "Failed to delete reviewed posts"
                    };
                }
            }
        },
        generateNewsArticle: {
            type: NewsReviewType,
            args: {
                artistPostId: { type: GraphQLNonNull(GraphQLID) }
            },
            async resolve(parent, { artistPostId }, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                try {
                    // Find the artist post
                    const artistPost = await ArtistPost.findById(artistPostId);
                    if (!artistPost) {
                        throw new Error("Artist post not found");
                    }

                    // Check if news article already exists for this post
                    const existingArticle = await NewsReview.findOne({ artistPostId });
                    if (existingArticle) {
                        throw new Error("News article already exists for this post");
                    }

                    // Generate the news article using AI
                    const article = await generateNewsArticle(
                        artistPost.artistName,
                        artistPost.content,
                        artistPost.postUrl,
                        artistPost.platform
                    );

                    // Create the news review entry
                    const newsReview = new NewsReview({
                        artistPostId: artistPost._id,
                        artistId: artistPost.artistId,
                        artistName: artistPost.artistName,
                        title: article.title,
                        content: article.content,
                        summary: article.summary,
                        sourcePostUrl: artistPost.postUrl,
                    });

                    await newsReview.save();

                    return newsReview;
                } catch (err) {
                    throw new Error(err.message || "Failed to generate news article");
                }
            }
        },
        generateManualNewsArticle: {
            type: NewsReviewType,
            args: {
                artistNames: { type: GraphQLList(GraphQLString) },
                content: { type: GraphQLNonNull(GraphQLString) },
                sourceUrl: { type: GraphQLString },
                imageUrl: { type: GraphQLString }
            },
            async resolve(parent, { artistNames, content, sourceUrl, imageUrl }, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                try {
                    const mongoose = require('mongoose');
                    const artistIds: any[] = [];
                    const validArtistNames: string[] = [];

                    // Handle multiple artists (or no artists)
                    if (artistNames && artistNames.length > 0) {
                        for (const name of artistNames) {
                            const artist = await Artist.findOne({ name });
                            if (artist) {
                                artistIds.push(artist._id);
                                validArtistNames.push(name);
                            }
                        }
                    }

                    // Generate the news article using AI
                    // Pass first artist name for context, or empty string if no artists
                    const primaryArtistName = validArtistNames.length > 0 ? validArtistNames[0] : '';
                    const article = await generateNewsArticle(
                        primaryArtistName,
                        content,
                        sourceUrl || '',
                        'manual'
                    );

                    // Create a placeholder ObjectId for artistPostId since this is manual
                    const placeholderPostId = new mongoose.Types.ObjectId();

                    // Create the news review entry with multi-artist support
                    const newsReview = new NewsReview({
                        artistPostId: placeholderPostId,
                        // Set legacy fields for backwards compatibility
                        artistId: artistIds.length > 0 ? artistIds[0] : null,
                        artistName: validArtistNames.length > 0 ? validArtistNames[0] : null,
                        // Set new array fields
                        artistIds: artistIds,
                        artistNames: validArtistNames,
                        title: article.title,
                        content: article.content,
                        summary: article.summary,
                        sourcePostUrl: sourceUrl || '',
                        imageUrl: imageUrl || '',
                    });

                    await newsReview.save();

                    return newsReview;
                } catch (err) {
                    throw new Error(err.message || "Failed to generate manual news article");
                }
            }
        },
        uploadNewsImage: {
            type: PresignedUrlType,
            args: {
                base64Data: { type: GraphQLNonNull(GraphQLString) },
                filename: { type: GraphQLNonNull(GraphQLString) },
                contentType: { type: GraphQLNonNull(GraphQLString) }
            },
            async resolve(parent, { base64Data, filename, contentType }, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                try {
                    const result = await uploadImageFromBase64(base64Data, filename, contentType);
                    return {
                        uploadUrl: '', // Not used in server-side upload
                        imageUrl: result.imageUrl,
                        key: result.key
                    };
                } catch (err) {
                    throw new Error(err.message || "Failed to upload image");
                }
            }
        },
        updateNewsReview: {
            type: MutationResponseType,
            args: {
                id: { type: GraphQLNonNull(GraphQLID) },
                title: { type: GraphQLString },
                content: { type: GraphQLString },
                summary: { type: GraphQLString },
                isReviewed: { type: GraphQLBoolean },
                isPublished: { type: GraphQLBoolean }
            },
            async resolve(parent, { id, title, content, summary, isReviewed, isPublished }, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                try {
                    // Get the existing news review to check if it's being published for the first time
                    const existingNewsReview = await NewsReview.findById(id);
                    if (!existingNewsReview) {
                        return { success: false, message: "News review not found" };
                    }

                    const updateData: any = {};
                    if (title !== undefined) updateData.title = title;
                    if (content !== undefined) updateData.content = content;
                    if (summary !== undefined) updateData.summary = summary;
                    if (isReviewed !== undefined) updateData.isReviewed = isReviewed;
                    if (isPublished !== undefined) {
                        updateData.isPublished = isPublished;
                        // Only set publishedAt when publishing for the first time
                        if (isPublished && !existingNewsReview.isPublished) {
                            updateData.publishedAt = new Date();
                        }
                    }

                    const newsReview = await NewsReview.findByIdAndUpdate(id, updateData, { new: true });
                    if (!newsReview) {
                        return { success: false, message: "News review not found" };
                    }

                    // If the article is being published for the first time, create an ArtistChange entry
                    if (isPublished && !existingNewsReview.isPublished) {
                        await ArtistChange.create({
                            artistName: newsReview.artistName,
                            changeType: 'news_article',
                            newsArticleId: newsReview._id.toString(),
                            newsArticleTitle: newsReview.title,
                            newsArticleSummary: newsReview.summary,
                            timestamp: new Date(),
                            processed: false,
                        });
                        console.log(`Created ArtistChange entry for published article: ${newsReview.title}`);
                    }

                    return { success: true, message: "News review updated successfully" };
                } catch (err) {
                    return {
                        success: false,
                        message: err.message || "Failed to update news review"
                    };
                }
            }
        },
        deleteNewsReview: {
            type: MutationResponseType,
            args: {
                id: { type: GraphQLNonNull(GraphQLID) }
            },
            async resolve(parent, { id }, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                try {
                    const newsReview = await NewsReview.findByIdAndDelete(id);
                    if (!newsReview) {
                        return { success: false, message: "News review not found" };
                    }

                    return { success: true, message: "News review deleted successfully" };
                } catch (err) {
                    return {
                        success: false,
                        message: err.message || "Failed to delete news review"
                    };
                }
            }
        },
        saveSigningBatch: {
            type: SigningBatchType,
            args: {
                batchId:   { type: GraphQLNonNull(GraphQLString) },
                name:      { type: GraphQLNonNull(GraphQLString) },
                createdAt: { type: GraphQLNonNull(GraphQLString) },
                archived:  { type: GraphQLBoolean },
                expanded:  { type: GraphQLBoolean },
                sortOrder: { type: GraphQLInt },
                rows:      { type: GraphQLList(CardRowInput) },
            },
            async resolve(parent, { batchId, name, createdAt, archived, expanded, sortOrder, rows }, context) {
                requireAuth(context.isAuthenticated);
                const update: any = { name, createdAt };
                if (archived !== undefined && archived !== null) update.archived = archived;
                if (expanded !== undefined && expanded !== null) update.expanded = expanded;
                if (sortOrder !== undefined && sortOrder !== null) update.sortOrder = sortOrder;
                if (rows !== undefined && rows !== null) update.rows = rows;
                return await SigningBatch.findOneAndUpdate(
                    { userId: context.userId, batchId },
                    { $set: update },
                    { new: true, upsert: true }
                );
            },
        },
        deleteSigningBatch: {
            type: MutationResponseType,
            args: {
                batchId: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, { batchId }, context) {
                requireAuth(context.isAuthenticated);
                try {
                    await SigningBatch.deleteOne({ userId: context.userId, batchId });
                    return { success: true };
                } catch (err: any) {
                    return { success: false, message: err.message || "Failed to delete signing batch" };
                }
            },
        },
        reorderSigningBatches: {
            type: MutationResponseType,
            args: {
                orderedBatchIds: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GraphQLString))) },
            },
            async resolve(parent, { orderedBatchIds }, context) {
                requireAuth(context.isAuthenticated);
                try {
                    await Promise.all(
                        orderedBatchIds.map((batchId: string, index: number) =>
                            SigningBatch.updateOne(
                                { userId: context.userId, batchId },
                                { $set: { sortOrder: index } }
                            )
                        )
                    );
                    return { success: true };
                } catch (err: any) {
                    return { success: false, message: err.message || "Failed to reorder batches" };
                }
            },
        },
        logPriceClick: {
            type: MutationResponseType,
            args: {
                artistName: { type: GraphQLNonNull(GraphQLString) },
                platform:   { type: GraphQLNonNull(GraphQLString) },
                cardName:   { type: GraphQLString },
                cardSet:    { type: GraphQLString },
            },
            async resolve(_parent, { artistName, platform, cardName, cardSet }) {
                const validPlatforms = ['manapool', 'tcgplayer', 'cardkingdom'];
                if (!validPlatforms.includes(platform)) {
                    return { success: false, message: "Invalid platform" };
                }
                try {
                    await PriceClick.create({ artistName, platform, cardName, cardSet });
                    return { success: true };
                } catch (err: any) {
                    return { success: false, message: err.message || "Failed to log click" };
                }
            },
        },
        logLinkClick: {
            type: MutationResponseType,
            args: {
                artistName: { type: GraphQLNonNull(GraphQLString) },
                linkType:   { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(_parent, { artistName, linkType }) {
                const validLinkTypes = ['website', 'facebook', 'instagram', 'twitter', 'patreon', 'youtube', 'artstation', 'bluesky', 'oma', 'inprnt', 'ebay', 'markssignatureservice', 'mountainmage'];
                if (!validLinkTypes.includes(linkType)) {
                    return { success: false, message: "Invalid link type" };
                }
                try {
                    await LinkClick.create({ artistName, linkType });
                    return { success: true };
                } catch (err: any) {
                    return { success: false, message: err.message || "Failed to log click" };
                }
            },
        },
        toggleCardCollectionField: {
            type: UserCardCollectionItemType,
            args: {
                scryfallId:      { type: GraphQLNonNull(GraphQLString) },
                cardName:        { type: GraphQLNonNull(GraphQLString) },
                artistName:      { type: GraphQLString },
                set:             { type: GraphQLNonNull(GraphQLString) },
                collectorNumber: { type: GraphQLNonNull(GraphQLString) },
                field:           { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, { scryfallId, cardName, artistName, set, collectorNumber, field }, context) {
                requireAuth(context.isAuthenticated);

                const validFields = ['signedNonfoil', 'signedFoil', 'wishlistSigned', 'artistProof', 'artistProofFoil'];
                if (!validFields.includes(field)) {
                    throw new Error("Invalid collection field");
                }

                try {
                    let item = await UserCardCollection.findOne({ userId: context.userId, scryfallId });
                    if (!item) {
                        item = new UserCardCollection({
                            userId: context.userId,
                            scryfallId,
                            cardName,
                            artistName: artistName || "",
                            set,
                            collectorNumber,
                        });
                    } else if (artistName && !item.get('artistName')) {
                        item.set('artistName', artistName);
                    }
                    (item as any)[field] = !(item as any)[field];
                    return await item.save();
                } catch (err) {
                    throw new Error("Failed to update card collection");
                }
            },
        },
    },
});

export default new GraphQLSchema({ query: RootQuery, mutation: mutations });