import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInputObjectType, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { ArtistType, ArtistEditLogType, ArtistFlagsType, ArtistPageType, ArtistPostType, AuthResponseType, RefreshTokenResponseType, CardPriceType, CardKingdomPriceType, TcgplayerProductType, ClickStatType, EmailPreferencesType, MapArtistToEventType, MutationResponseType, NewsReviewType, SigningReportSummaryType, SigningReportType, PasswordUpdateResponseType, PresignedUrlType, ScanUrlResultType, SigningBatchType, SigningEventType, TimeseriesPointType, TopArtistClickType, UserCardCollectionItemType, UserType } from "../schema/schema";
import Artist, { IArtist } from "../models/Artist";
import { Document, HydratedDocument, isValidObjectId, startSession } from "mongoose";
import User, { IUser } from "../models/User";
import UserCardCollection from "../models/UserCardCollection";
import SigningEvent from "../models/SigningEvent";
import { hashSync, compareSync } from "bcryptjs";
import MapArtistToEvent from "../models/MapArtistToEvent";
import CardPrice from "../models/CardPrice";
import CardKingdomPrice from "../models/CardKingdomPrice";
import SetArtists from "../models/SetArtists";
import ArtistChange from "../models/ArtistChange";
import EventChange from "../models/EventChange";
import ArtistPost from "../models/ArtistPost";
import NewsReview from "../models/NewsReview";
import SigningBatch from "../models/SigningBatch";
import LinkClick from "../models/LinkClick";
import PriceClick from "../models/PriceClick";
import PageView from "../models/PageView";
import SigningReport from "../models/SigningReport";
import ArtistEditLog from "../models/ArtistEditLog";
import { generateToken, generateRefreshToken, verifyRefreshToken, requireAuth, requireAdmin } from "../middleware/auth";
import { sendWelcomeEmail } from "../services/emailService";
import { generateNewsArticle } from "../services/aiNewsService";
import { CDN_BASE_URL, deleteImage, uploadImageFromBase64 } from "../services/s3UploadService";
import { cleanSignatureLabel, legacySignatureExample, legacySignatureId, MAX_SIGNATURE_EXAMPLES, MAX_SIGNATURE_IMAGE_BYTES, reorderSignatureExamples } from "../services/signatureExamples";
import { cacheDelete, cacheGet, cacheSet, invalidateArtistCache } from "../utils/artistCache";
import { escapeRegex } from "../utils/regex";
import { renderPageText } from "../services/urlScanService";
import { findArtistMatches } from "../services/artistNameMatcher";
import { matchSetArtists } from "../services/setArtists";
import { groupOrderMutations, groupOrderQueries } from "./groupOrders";
import { groupOrderProgressMutations } from "./groupOrderProgress";
import { groupOrderAdminMutations, groupOrderAdminQueries } from "./groupOrderAdmin";
import { mongoProductStore, resolveTcgplayerProducts } from "../services/tcgplayerProducts";
import { recordArtistUpdate } from "../services/artistChangeTracker";
import { ARTIST_EDITABLE_FIELDS, diffArtistProfile, hasArtistAccess, validateArtistProfileUpdate } from "../services/artistProfile";
import {
    PER_ARTIST_COOLDOWN_DAYS,
    SigningReportSummary,
    needsReview,
    rateLimitMessage,
    summarizeReports,
    summaryWindowStart,
    validateSigningReport,
} from "../services/signingReports";

const UPDATABLE_ARTIST_FIELDS = new Set([
    "name",
    "email",
    "artistProofs",
    "facebook",
    "haveSignature",
    "instagram",
    "patreon",
    "signing",
    "signingComment",
    "twitter",
    "url",
    "youtube",
    "mountainmage",
    "markssignatureservice",
    "filename",
    "artstation",
    "location",
    "bluesky",
    "omalink",
    "inprnt",
    "scryfall_name",
    "alternate_names",
]);

type DocumentType = Document<any, any, any>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// bcrypt only uses the first 72 bytes of a password
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 72;

const validatePassword = (password: string): string | null => {
    if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
    return null;
};

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

// Midnight at the start of a Pacific calendar day, `daysAgo` days before now (0 = today).
// Subtracting in raw UTC milliseconds first, then formatting with the IANA zone, means the
// correct historical PST/PDT offset is used even when the range spans a DST transition.
function startOfDayPacific(daysAgo: number = 0): Date {
    const tz = 'America/Los_Angeles';
    const target = new Date(Date.now() - daysAgo * 86400000);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        timeZoneName: 'shortOffset',
    }).formatToParts(target);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    const match = get('timeZoneName').match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
    const offsetHours = match ? parseInt(match[1], 10) : 0;
    const offsetMinutes = match?.[2] ? parseInt(match[2], 10) : 0;
    const sign = offsetHours < 0 ? '-' : '+';
    const offset = `${sign}${String(Math.abs(offsetHours)).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
    return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00${offset}`);
}

// Midnight at the start of "today" in US Pacific time (handles PST/PDT automatically).
function startOfTodayPacific(): Date {
    return startOfDayPacific(0);
}

function rangeToDate(range?: string | null): Date | null {
    if (!range || range === 'all') return null;
    if (range === 'today') return startOfTodayPacific();
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : null;
    if (days === null) return null;
    // Anchor to Pacific midnight (not the server's raw clock) so day-based ranges land on the
    // same day boundary as "today" and the Pacific-bucketed daily charts. Includes today plus
    // (days - 1) prior full days, e.g. "7d" covers the last 7 calendar days including today.
    return startOfDayPacific(days - 1);
}

// Buckets timestamps into calendar days in US Pacific time so "today" and the
// daily charts agree on where one day ends and the next begins.
const PACIFIC_DAY_GROUP_ID = {
    year:  { $year:  { date: '$timestamp', timezone: 'America/Los_Angeles' } },
    month: { $month: { date: '$timestamp', timezone: 'America/Los_Angeles' } },
    day:   { $dayOfMonth: { date: '$timestamp', timezone: 'America/Los_Angeles' } },
};

const SigningReportExtraInput = new GraphQLInputObjectType({
    name: "SigningReportExtraInput",
    fields: {
        kind:  { type: GraphQLNonNull(GraphQLString) },
        price: { type: GraphQLNonNull(GraphQLFloat) },
    },
});

const SigningReportInput = new GraphQLInputObjectType({
    name: "SigningReportInput",
    fields: {
        signedOn:        { type: GraphQLNonNull(GraphQLString) },
        method:          { type: GraphQLNonNull(GraphQLString) },
        pricePerSig:     { type: GraphQLNonNull(GraphQLFloat) },
        freeCount:       { type: GraphQLInt },
        perPersonLimit:  { type: GraphQLInt },
        extras:          { type: GraphQLList(GraphQLNonNull(SigningReportExtraInput)) },
        turnaroundWeeks: { type: GraphQLInt },
        eventId:         { type: GraphQLID },
        serviceName:     { type: GraphQLString },
        note:            { type: GraphQLString },
    },
});

const ArtistProfileInput = new GraphQLInputObjectType({
    name: "ArtistProfileInput",
    fields: Object.fromEntries(ARTIST_EDITABLE_FIELDS.map((field) => [field, { type: GraphQLString }])),
});

// Admins can open any artist's dashboard; everyone else needs an admin to have
// set isVerifiedArtist and artistId on their user row. Read from the database
// on every call so revoking access there takes effect immediately.
async function requireArtistAccess(context: any, artistId: string) {
    requireAuth(context.isAuthenticated);
    if (!isValidObjectId(artistId)) throw new Error("Artist not found.");
    if (context.userRole === 'admin') return;
    const user = await User.findById(context.userId).select('isVerifiedArtist artistId').lean();
    if (!hasArtistAccess(user, artistId)) {
        throw new Error("You don't have access to this artist's dashboard.");
    }
}

// Signature example changes go in the same audit trail as dashboard edits.
async function logSignatureExampleEdit(artist: HydratedDocument<IArtist>, context: any, change: { field: string; before?: string; after?: string }) {
    invalidateArtistCache();
    await ArtistEditLog.create({
        artistId: artist._id,
        artistName: artist.name,
        userId: context.userId,
        byAdmin: context.userRole === 'admin',
        changes: [change],
    });
}

// Never shown publicly: who submitted a report, or anything about its review.
const PRIVATE_REPORT_FIELDS = { userId: 0, status: 0, rejectionReason: 0, reviewedAt: 0, reviewedBy: 0 };

const signingSummaryKey = (artistName: string): `signingSummary:${string}` => `signingSummary:${artistName.toLowerCase()}`;

async function loadSigningSummary(artistName: string): Promise<SigningReportSummary> {
    const key = signingSummaryKey(artistName);
    const cached = cacheGet<SigningReportSummary>(key);
    if (cached) return cached;
    const reports = await SigningReport.find(
        { artistName, status: 'approved', signedOn: { $gte: summaryWindowStart() } },
        { signedOn: 1, method: 1, pricePerSig: 1 },
    ).lean();
    const summary = summarizeReports(reports);
    cacheSet(key, summary);
    return summary;
}

// Reports are keyed by artist name, so follow the artist when it's renamed.
async function renameSigningReports(oldName: string, newName?: string) {
    if (!newName || newName === oldName) return;
    await SigningReport.updateMany({ artistName: oldName }, { $set: { artistName: newName } });
    cacheDelete(signingSummaryKey(oldName));
}

const RootQuery = new GraphQLObjectType({
    name: "RootQuery",
    fields: {
        ...groupOrderQueries,
        ...groupOrderAdminQueries,
        // Get all artists
        artists: {
            type: GraphQLList(ArtistType),
            async resolve() {
                return await Artist.find().sort({ name: 1 }).collation({ locale: "en", caseLevel: true });
            },
        },
        // Lightweight list for autocomplete/dropdown — name and filename only
        artistNames: {
            type: GraphQLNonNull(GraphQLList(GraphQLNonNull(ArtistType))),
            async resolve() {
                const cached = cacheGet<any[]>('artistNames');
                if (cached) return cached;
                const result = await Artist.find()
                    .select('name filename')
                    .sort({ name: 1 })
                    .collation({ locale: 'en', caseLevel: true })
                    .lean();
                cacheSet('artistNames', result);
                return result;
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
                const cacheKey = `artistsPage:${offset}:${safeLimit}` as const;
                const cached = cacheGet<{ artists: any[]; total: number }>(cacheKey);
                if (cached) return cached;
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
                const result = { artists, total };
                cacheSet(cacheKey, result);
                return result;
            },
        },
        // Lightweight filter index — one packed bitfield per artist instead of four string fields.
        // Bit 0: markssignatureservice === "true"
        // Bit 1: mountainmage truthy (non-empty, not "false")
        // Bit 2: artistProofs === "yes" | "true"
        artistFilterFlags: {
            type: GraphQLNonNull(GraphQLList(GraphQLNonNull(ArtistFlagsType))),
            async resolve() {
                const cached = cacheGet<any[]>('artistFilterFlags');
                if (cached) return cached;
                const artists = await Artist.find()
                    .select('name filename location alternate_names markssignatureservice mountainmage artistProofs')
                    .sort({ name: 1 })
                    .collation({ locale: 'en', caseLevel: true })
                    .lean();
                const result = artists.map((a: any) => {
                    let flags = 0;
                    if (a.markssignatureservice === 'true') flags |= 1;
                    if (a.mountainmage && a.mountainmage !== '' && a.mountainmage !== 'false') flags |= 2;
                    if (a.artistProofs === 'yes' || a.artistProofs === 'true') flags |= 4;
                    return { name: a.name, flags, location: a.location ?? null, alternate_names: a.alternate_names ?? null, filename: a.filename ?? null };
                });
                cacheSet('artistFilterFlags', result);
                return result;
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
        // The artist a verified user manages, or (for admins, or with an id
        // the user has access to) a specific artist. Null when the user isn't
        // a verified artist.
        artistDashboard: {
            type: ArtistType,
            args: { artistId: { type: GraphQLID } },
            async resolve(_parent, { artistId }, context) {
                requireAuth(context.isAuthenticated);
                if (artistId) {
                    await requireArtistAccess(context, artistId);
                    return await Artist.findById(artistId);
                }
                const user = await User.findById(context.userId).select('isVerifiedArtist artistId').lean();
                if (!user?.isVerifiedArtist || !user.artistId) return null;
                return await Artist.findById(user.artistId);
            },
        },
        artistEditLog: {
            type: GraphQLList(ArtistEditLogType),
            args: { artistId: { type: GraphQLNonNull(GraphQLID) } },
            async resolve(_parent, { artistId }, context) {
                await requireArtistAccess(context, artistId);
                return await ArtistEditLog.find({ artistId }).sort({ createdAt: -1 }).limit(25).lean();
            },
        },
        users: {
            type: GraphQLList(UserType),
            async resolve(parent, args, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
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
        // Our artists credited in a set, for the homepage "Set" filter.
        // null = the set hasn't been indexed yet (see jobs/setArtistSync.ts).
        artistsBySet: {
            type: GraphQLList(GraphQLNonNull(GraphQLString)),
            args: { code: { type: GraphQLNonNull(GraphQLString) }},
            async resolve(parent, { code }) {
                const set = await SetArtists.findOne({ code: code.toLowerCase() }, { scryfall_artists: 1 }).lean();
                if (!set) return null;
                let dbArtists = cacheGet<{ name: string; scryfall_name?: string }[]>('artistScryfallNames');
                if (!dbArtists) {
                    dbArtists = await Artist.find().select('name scryfall_name').lean();
                    cacheSet('artistScryfallNames', dbArtists);
                }
                return matchSetArtists(set.scryfall_artists, dbArtists);
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
                    name: { $in: names.map((name: string) => new RegExp(`^${escapeRegex(name)}$`, 'i')) },
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
        tcgplayerProducts: {
            type: GraphQLNonNull(GraphQLList(GraphQLNonNull(TcgplayerProductType))),
            args: {
                ids: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GraphQLInt))) },
            },
            async resolve(_parent, { ids }) {
                // Best-effort: Mass Entry falls back to Scryfall naming for anything missing.
                try {
                    return await resolveTcgplayerProducts(ids, mongoProductStore);
                } catch (err) {
                    console.error('Error resolving TCGplayer products:', err);
                    return [];
                }
            },
        },
        signingBatches: {
            type: GraphQLList(SigningBatchType),
            async resolve(parent, args, context) {
                requireAuth(context.isAuthenticated);
                // Group orders have their own queries (organizedGroupOrders / myGroupOrders).
                return await SigningBatch.find({ userId: context.userId, groupOrder: null }).sort({ sortOrder: 1, createdAt: 1 });
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
                    artistName: { $regex: new RegExp(`^${escapeRegex(artistName)}$`, 'i') },
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
        clickStats: {
            type: GraphQLNonNull(GraphQLList(GraphQLNonNull(ClickStatType))),
            args: {
                range:   { type: GraphQLString },
                groupBy: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(_parent, { range, groupBy }, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
                const since = rangeToDate(range);
                const matchStage = since ? { timestamp: { $gte: since } } : {};

                if (groupBy === 'vendor') {
                    const rows = await PriceClick.aggregate([
                        { $match: matchStage },
                        { $group: { _id: '$platform', count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                    ]);
                    return rows.map((r: any) => ({ key: r._id, count: r.count }));
                }

                if (groupBy === 'placement') {
                    const rows = await PriceClick.aggregate([
                        { $match: matchStage },
                        { $group: { _id: { placement: { $ifNull: ['$placement', 'allcards'] }, platform: '$platform' }, count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                    ]);
                    return rows.map((r: any) => ({ key: `${r._id.placement} · ${r._id.platform}`, count: r.count }));
                }

                if (groupBy === 'platform') {
                    const rows = await LinkClick.aggregate([
                        { $match: matchStage },
                        { $group: { _id: '$linkType', count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                    ]);
                    return rows.map((r: any) => ({ key: r._id, count: r.count }));
                }

                if (groupBy === 'artist') {
                    const [price, link] = await Promise.all([
                        PriceClick.aggregate([
                            { $match: matchStage },
                            { $group: { _id: '$artistName', count: { $sum: 1 } } },
                        ]),
                        LinkClick.aggregate([
                            { $match: matchStage },
                            { $group: { _id: '$artistName', count: { $sum: 1 } } },
                        ]),
                    ]);
                    const combined: Record<string, number> = {};
                    [...price, ...link].forEach((r: any) => {
                        combined[r._id] = (combined[r._id] || 0) + r.count;
                    });
                    return Object.entries(combined)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, count]) => ({ key, count }));
                }

                if (groupBy === 'day') {
                    const groupId = PACIFIC_DAY_GROUP_ID;
                    const [price, link] = await Promise.all([
                        PriceClick.aggregate([
                            { $match: matchStage },
                            { $group: { _id: groupId, count: { $sum: 1 } } },
                        ]),
                        LinkClick.aggregate([
                            { $match: matchStage },
                            { $group: { _id: groupId, count: { $sum: 1 } } },
                        ]),
                    ]);
                    const combined: Record<string, number> = {};
                    [...price, ...link].forEach((r: any) => {
                        const key = `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`;
                        combined[key] = (combined[key] || 0) + r.count;
                    });
                    return Object.entries(combined)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, count]) => ({ key, count }));
                }

                return [];
            },
        },
        topArtistsByClicks: {
            type: GraphQLNonNull(GraphQLList(GraphQLNonNull(TopArtistClickType))),
            args: {
                range: { type: GraphQLString },
                limit: { type: GraphQLInt },
            },
            async resolve(_parent, { range, limit }, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
                const since = rangeToDate(range);
                const matchStage = since ? { timestamp: { $gte: since } } : {};
                const safeLimit = Math.min(Math.max(1, limit ?? 10), 50);

                const [price, link] = await Promise.all([
                    PriceClick.aggregate([
                        { $match: matchStage },
                        { $group: { _id: '$artistName', count: { $sum: 1 } } },
                    ]),
                    LinkClick.aggregate([
                        { $match: matchStage },
                        { $group: { _id: '$artistName', count: { $sum: 1 } } },
                    ]),
                ]);

                const combined: Record<string, number> = {};
                [...price, ...link].forEach((r: any) => {
                    combined[r._id] = (combined[r._id] || 0) + r.count;
                });

                const sorted = Object.entries(combined)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, safeLimit);

                const artistNames = sorted.map(([name]) => name);
                const artists = await Artist.find({ name: { $in: artistNames } }).select('name _id').lean();
                const idMap: Record<string, string> = {};
                (artists as any[]).forEach((a) => { idMap[a.name] = a._id.toString(); });

                return sorted.map(([artistName, count]) => ({
                    artistName,
                    artistId: idMap[artistName] ?? null,
                    count,
                }));
            },
        },
        clickTimeseries: {
            type: GraphQLNonNull(GraphQLList(GraphQLNonNull(TimeseriesPointType))),
            args: {
                range: { type: GraphQLString },
            },
            async resolve(_parent, { range }, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
                const since = rangeToDate(range);
                const matchStage = since ? { timestamp: { $gte: since } } : {};

                const groupId = PACIFIC_DAY_GROUP_ID;

                const [price, link] = await Promise.all([
                    PriceClick.aggregate([
                        { $match: matchStage },
                        { $group: { _id: groupId, count: { $sum: 1 } } },
                    ]),
                    LinkClick.aggregate([
                        { $match: matchStage },
                        { $group: { _id: groupId, count: { $sum: 1 } } },
                    ]),
                ]);

                const combined: Record<string, number> = {};
                [...price, ...link].forEach((r: any) => {
                    const date = `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`;
                    combined[date] = (combined[date] || 0) + r.count;
                });

                return Object.entries(combined)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([date, count]) => ({ date, count }));
            },
        },
        pageViewCount: {
            type: GraphQLNonNull(GraphQLInt),
            args: {
                range: { type: GraphQLString },
            },
            async resolve(_parent, { range }, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
                const since = rangeToDate(range);
                const matchStage = since ? { timestamp: { $gte: since } } : {};
                return await PageView.countDocuments(matchStage);
            },
        },
        pageViewTimeseries: {
            type: GraphQLNonNull(GraphQLList(GraphQLNonNull(TimeseriesPointType))),
            args: {
                range: { type: GraphQLString },
            },
            async resolve(_parent, { range }, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
                const since = rangeToDate(range);
                const matchStage = since ? { timestamp: { $gte: since } } : {};

                const rows = await PageView.aggregate([
                    { $match: matchStage },
                    { $group: {
                        _id: PACIFIC_DAY_GROUP_ID,
                        count: { $sum: 1 },
                    } },
                ]);

                return rows
                    .map((r: any) => ({
                        date: `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`,
                        count: r.count,
                    }))
                    .sort((a, b) => a.date.localeCompare(b.date));
            },
        },
        topPagesByViews: {
            type: GraphQLNonNull(GraphQLList(GraphQLNonNull(ClickStatType))),
            args: {
                range: { type: GraphQLString },
                limit: { type: GraphQLInt },
            },
            async resolve(_parent, { range, limit }, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
                const since = rangeToDate(range);
                const matchStage = since ? { timestamp: { $gte: since } } : {};
                const safeLimit = Math.min(Math.max(1, limit ?? 10), 50);

                const rows = await PageView.aggregate([
                    { $match: matchStage },
                    { $group: { _id: '$path', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: safeLimit },
                ]);
                return rows.map((r: any) => ({ key: r._id, count: r.count }));
            },
        },
        signingReportSummary: {
            type: GraphQLNonNull(SigningReportSummaryType),
            args: { artistName: { type: GraphQLNonNull(GraphQLString) } },
            async resolve(_parent, { artistName }) {
                return await loadSigningSummary(artistName);
            },
        },
        recentSigningReports: {
            type: GraphQLList(SigningReportType),
            args: {
                artistName: { type: GraphQLNonNull(GraphQLString) },
                limit:      { type: GraphQLInt, defaultValue: 5 },
            },
            async resolve(_parent, { artistName, limit }) {
                return await SigningReport.find({ artistName, status: 'approved' }, PRIVATE_REPORT_FIELDS)
                    .sort({ signedOn: -1 })
                    .limit(Math.min(Math.max(limit, 1), 20))
                    .lean();
            },
        },
        pendingSigningReports: {
            type: GraphQLList(SigningReportType),
            args: { limit: { type: GraphQLInt, defaultValue: 50 } },
            async resolve(_parent, { limit }, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
                const reports = await SigningReport.find({ status: 'pending' })
                    .sort({ createdAt: 1 })
                    .limit(Math.min(limit, 200))
                    .lean();
                const userIds = [...new Set(reports.map((r) => String(r.userId)))];
                const [users, approvedCounts] = await Promise.all([
                    User.find({ _id: { $in: userIds } }, { name: 1 }).lean(),
                    SigningReport.aggregate([
                        { $match: { userId: { $in: reports.map((r) => r.userId) }, status: 'approved' } },
                        { $group: { _id: '$userId', count: { $sum: 1 } } },
                    ]),
                ]);
                const nameById = new Map(users.map((u: any) => [String(u._id), u.name]));
                const approvedById = new Map(approvedCounts.map((c: any) => [String(c._id), c.count]));
                const medians = new Map<string, number | null>();
                for (const artistName of new Set(reports.map((r) => r.artistName))) {
                    medians.set(artistName, (await loadSigningSummary(artistName)).medianPrice);
                }
                return reports.map((r) => ({
                    ...r,
                    submitterName: nameById.get(String(r.userId)) ?? null,
                    submitterApprovedCount: approvedById.get(String(r.userId)) ?? 0,
                    artistMedianPrice: medians.get(r.artistName) ?? null,
                }));
            },
        },
        mySigningReports: {
            type: GraphQLList(SigningReportType),
            async resolve(_parent, _args, context) {
                requireAuth(context.isAuthenticated);
                return await SigningReport.find({ userId: context.userId }, { userId: 0, reviewedBy: 0 })
                    .sort({ createdAt: -1 })
                    .limit(100)
                    .lean();
            },
        },
    },
});

const mutations = new GraphQLObjectType({
    name: "mutations",
    fields: {
        ...groupOrderMutations,
        ...groupOrderProgressMutations,
        ...groupOrderAdminMutations,
         // user signup
         signup: {
            type: AuthResponseType,
            args: {
                name: { type: GraphQLNonNull(GraphQLString) },
                email: { type: GraphQLNonNull(GraphQLString) },
                password: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, {name, email, password}) {
                if (!name.trim() || name.length > 100) throw new Error("Please enter a valid name");
                if (!EMAIL_REGEX.test(email) || email.length > 254) throw new Error("Please enter a valid email address");
                const passwordError = validatePassword(password);
                if (passwordError) throw new Error(passwordError);

                let existingUser: HydratedDocument<IUser> | null;
                try {
                    existingUser = await User.findOne({ email });
                    if(existingUser) throw new Error("User already exists");
                    const encryptedPassword = hashSync(password);
                    // Default role is 'user', will be set by model default
                    const user = new User({name, email, password: encryptedPassword});
                    const savedUser = await user.save();

                    // Generate JWT token with user role
                    const token = generateToken(savedUser._id.toString(), savedUser.role);
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
                let existingUser: HydratedDocument<IUser> | null;
                try {
                    existingUser = await User.findOne({email});
                    if (!existingUser) throw new Error("Invalid email or password");
                    const decryptedPassword = compareSync(password, existingUser.password);
                    if(!decryptedPassword) throw new Error("Invalid email or password");

                    // Generate JWT token with user role
                    const token = generateToken(existingUser._id.toString(), existingUser.role);
                    const refreshToken = generateRefreshToken(existingUser._id.toString(), existingUser.role, existingUser.tokenVersion ?? 0);

                    return {
                        token,
                        refreshToken,
                        user: existingUser
                    };
                } catch (err) {
                    throw err;
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
                    // Re-read the user so deleted accounts, role changes and
                    // revoked sessions (tokenVersion bump) take effect here.
                    const user = await User.findById(decoded.userId).select('role tokenVersion');
                    if (!user || (decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
                        throw new Error("Refresh token revoked");
                    }
                    const token = generateToken(user._id.toString(), user.role);
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

                const existingArtist = await Artist.findOne({ name });
                if (existingArtist) throw new Error("Artist already exists");

                let savedArtist;
                try {
                    const artist = new Artist({
                        name,
                        scryfall_name: name,
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
                    savedArtist = await artist.save();
                } catch (err) {
                    throw new Error("Artist Signup Failed. Try again.");
                }

                invalidateArtistCache();

                try {
                    await ArtistChange.create({
                        artistName: name,
                        changeType: 'new_artist',
                        timestamp: new Date(),
                        processed: false
                    });
                } catch (err) {
                    // Non-fatal — artist was saved successfully
                }

                return savedArtist;
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
                let artist: HydratedDocument<IArtist> | null;
                try {
                    session.startTransaction({ session });
                    artist = await Artist.findById(id);
                    if (!artist) throw new Error("Artist not found");
                    const deleted = await Artist.findByIdAndDelete(artist.id);
                    invalidateArtistCache();
                    return deleted;
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

                const result = await Artist.deleteMany({});
                invalidateArtistCache();
                return result;
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

                if (!UPDATABLE_ARTIST_FIELDS.has(fieldName)) {
                    throw new Error(`Field '${fieldName}' is not updatable`);
                }

                const session = await startSession();
                let artist:DocumentType;
                let updateValue = {};
                updateValue[fieldName] = valueToSet;
                try {
                    session.startTransaction({session});
                    artist = await Artist.findById(id);
                    if (!artist) throw new Error("Artist not found");
                    const updated = await Artist.findByIdAndUpdate(
                            { _id: artist.id },
                            updateValue
                        );
                    invalidateArtistCache();
                    await renameSigningReports((artist as any).name, updateValue["name"]);
                    await recordArtistUpdate(updateValue["name"] ?? (artist as any).name, artist.toObject(), updateValue);
                    return updated;
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

                    const updateData: any = {};
                    for (const [key, value] of Object.entries(updateFields)) {
                        if (value !== undefined && value !== null) {
                            updateData[key] = value;
                        }
                    }

                    // Update the artist
                    const updatedArtist = await Artist.findByIdAndUpdate(
                        id,
                        { $set: updateData },
                        { new: true }
                    );

                    invalidateArtistCache();
                    await renameSigningReports(currentArtist.name, updateData.name);
                    // Queue follower-visible changes for the daily artist digest
                    await recordArtistUpdate(updatedArtist.name, currentArtist.toObject(), updateData);

                    return updatedArtist;
                } catch (err) {
                    throw new Error(err.message || "Update artist failed");
                }
            },
        },
        // Edits from the artist dashboard. Only the fields in
        // ARTIST_EDITABLE_FIELDS can change here; everything else stays admin-only.
        updateArtistProfile: {
            type: ArtistType,
            args: {
                artistId: { type: GraphQLNonNull(GraphQLID) },
                input:    { type: GraphQLNonNull(ArtistProfileInput) },
            },
            async resolve(_parent, { artistId, input }, context) {
                await requireArtistAccess(context, artistId);

                const artist = await Artist.findById(artistId);
                if (!artist) throw new Error("Artist not found.");

                const changes = diffArtistProfile(artist.toObject(), validateArtistProfileUpdate(input));
                if (changes.length === 0) return artist;

                const updateData: Record<string, string> = {};
                for (const { field, after } of changes) updateData[field] = after;

                const updatedArtist = await Artist.findByIdAndUpdate(
                    artistId,
                    { $set: { ...updateData, ...('artistNote' in updateData && { artistNoteUpdatedAt: new Date() }) } },
                    { new: true },
                );

                invalidateArtistCache();
                await ArtistEditLog.create({
                    artistId: artist._id,
                    artistName: artist.name,
                    userId: context.userId,
                    byAdmin: context.userRole === 'admin',
                    changes,
                });
                await recordArtistUpdate(artist.name, artist.toObject(), updateData);

                return updatedArtist;
            },
        },
        // Signature examples, managed by admins and the verified artist. Each
        // returns the artist so the client can refresh its list.
        addSignatureExample: {
            type: ArtistType,
            args: {
                artistId:    { type: GraphQLNonNull(GraphQLID) },
                base64Data:  { type: GraphQLNonNull(GraphQLString) },
                contentType: { type: GraphQLNonNull(GraphQLString) },
                label:       { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(_parent, { artistId, base64Data, contentType, label }, context) {
                await requireArtistAccess(context, artistId);
                const cleanLabel = cleanSignatureLabel(label);

                const artist = await Artist.findById(artistId);
                if (!artist) throw new Error("Artist not found.");
                // Keep the old single image by saving it as the first example.
                const legacy = legacySignatureExample(artist, CDN_BASE_URL);
                const existing = legacy ? [legacy] : artist.signatureExamples ?? [];
                if (existing.length >= MAX_SIGNATURE_EXAMPLES) {
                    throw new Error(`Artists can have up to ${MAX_SIGNATURE_EXAMPLES} signature examples.`);
                }

                const { imageUrl, key } = await uploadImageFromBase64(base64Data, 'signature', contentType, {
                    prefix: `signatures/${artist._id}`,
                    maxBytes: MAX_SIGNATURE_IMAGE_BYTES,
                });
                const order = existing.reduce((max, e) => Math.max(max, e.order ?? 0), -1) + 1;
                const added = { imageUrl, key, label: cleanLabel, order, uploadedBy: context.userId };
                const updated = await Artist.findByIdAndUpdate(
                    artistId,
                    { $push: { signatureExamples: { $each: legacy ? [legacy, added] : [added] } } },
                    { new: true },
                );

                await logSignatureExampleEdit(artist, context, { field: 'signatureExamples', after: cleanLabel });
                await recordArtistUpdate(artist.name, { signatureExamples: '' }, { signatureExamples: cleanLabel });
                return updated;
            },
        },
        updateSignatureExample: {
            type: ArtistType,
            args: {
                artistId:  { type: GraphQLNonNull(GraphQLID) },
                exampleId: { type: GraphQLNonNull(GraphQLID) },
                label:     { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(_parent, { artistId, exampleId, label }, context) {
                await requireArtistAccess(context, artistId);
                const cleanLabel = cleanSignatureLabel(label);

                const artist = await Artist.findById(artistId);
                const example = artist?.signatureExamples?.find((e) => String(e._id) === exampleId);
                if (!artist || !example) throw new Error("Signature example not found.");
                if (example.label === cleanLabel) return artist;

                const updated = await Artist.findOneAndUpdate(
                    { _id: artistId, 'signatureExamples._id': exampleId },
                    { $set: { 'signatureExamples.$.label': cleanLabel } },
                    { new: true },
                );
                await logSignatureExampleEdit(artist, context, { field: 'signatureExamples', before: example.label, after: cleanLabel });
                return updated;
            },
        },
        removeSignatureExample: {
            type: ArtistType,
            args: {
                artistId:  { type: GraphQLNonNull(GraphQLID) },
                exampleId: { type: GraphQLNonNull(GraphQLID) },
            },
            async resolve(_parent, { artistId, exampleId }, context) {
                await requireArtistAccess(context, artistId);

                const artist = await Artist.findById(artistId);
                if (!artist) throw new Error("Artist not found.");
                const legacy = legacySignatureExample(artist, CDN_BASE_URL);
                const unsavedLegacy = !!legacy && exampleId === legacySignatureId(artist);
                const example = unsavedLegacy
                    ? legacy
                    : artist.signatureExamples?.find((e) => String(e._id) === exampleId);
                if (!example) throw new Error("Signature example not found.");

                // Removing the old single image also clears haveSignature so
                // the fallback doesn't bring it back.
                const isLegacy = example.key === `signatures/${artist.filename}.jpg`;
                const updated = await Artist.findByIdAndUpdate(
                    artistId,
                    {
                        ...(!unsavedLegacy && { $pull: { signatureExamples: { _id: exampleId } } }),
                        ...(isLegacy && { $set: { haveSignature: 'false' } }),
                    },
                    { new: true },
                );
                // Only delete files this feature uploaded, never the legacy images.
                if (example.key?.startsWith(`signatures/${artist._id}/`)) await deleteImage(example.imageUrl);

                await logSignatureExampleEdit(artist, context, { field: 'signatureExamples', before: example.label });
                return updated;
            },
        },
        reorderSignatureExamples: {
            type: ArtistType,
            args: {
                artistId:   { type: GraphQLNonNull(GraphQLID) },
                exampleIds: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GraphQLID))) },
            },
            async resolve(_parent, { artistId, exampleIds }, context) {
                await requireArtistAccess(context, artistId);

                const artist = await Artist.findById(artistId);
                if (!artist) throw new Error("Artist not found.");
                const examples = artist.signatureExamples ?? [];
                const order = reorderSignatureExamples(examples.map((e) => String(e._id)), exampleIds);
                for (const example of examples) example.order = order.get(String(example._id))!;
                await artist.save();

                invalidateArtistCache();
                return artist;
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
        // remove artist from event
        removeArtistFromEvent: {
            type: MapArtistToEventType,
            args: {
                artistName: { type: GraphQLNonNull(GraphQLString) },
                eventId: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(parent, {artistName, eventId}, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                const removed = await MapArtistToEvent.findOneAndDelete({ artistName, eventId });
                if (!removed) throw new Error("Artist is not attached to this event");

                try {
                    // Drop pending digest notifications so a removed artist isn't announced
                    await ArtistChange.deleteMany({ artistName, eventId, changeType: 'added_to_event', processed: false });
                    await EventChange.deleteMany({ artistName, eventId, changeType: 'artist_added', processed: false });
                } catch (err) {
                    console.error("Failed to clear pending event notifications:", err);
                }

                return removed;
            },
        },
        // update password
        updatePassword: {
            type: PasswordUpdateResponseType,
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
                    const isPasswordValid = compareSync(currentPassword, user.password);
                    if (!isPasswordValid) {
                        return {
                            success: false,
                            message: "Current password is incorrect"
                        };
                    }

                    const passwordError = validatePassword(newPassword);
                    if (passwordError) {
                        return {
                            success: false,
                            message: passwordError
                        };
                    }

                    // Hash and update new password, and revoke every existing
                    // session by bumping tokenVersion
                    const encryptedPassword = hashSync(newPassword);
                    user.password = encryptedPassword;
                    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
                    await user.save();

                    // Issue fresh tokens so the caller's own session survives
                    return {
                        success: true,
                        message: "Password updated successfully",
                        token: generateToken(user._id.toString(), user.role),
                        refreshToken: generateRefreshToken(user._id.toString(), user.role, user.tokenVersion)
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
                    user.set('emailPreferences.siteUpdates', siteUpdates);
                    user.set('emailPreferences.artistUpdates', artistUpdates);
                    user.set('emailPreferences.localSigningEvents', localSigningEvents);
                    user.set('emailPreferences.newArtistNotifications', newArtistNotifications);

                    // Mark the nested field as modified
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

                    if (!user.followedArtists) {
                        user.followedArtists = [];
                    }

                    // Check if already following
                    if (user.followedArtists.includes(artistName)) {
                        return {
                            success: false,
                            message: "Already following this artist"
                        };
                    }

                    // Add artist to followed list
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

                    if (!user.followedArtists || !user.followedArtists.includes(artistName)) {
                        return {
                            success: false,
                            message: "Not following this artist"
                        };
                    }

                    // Remove artist from followed list
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

                    if (!user.monitoredStates) {
                        user.monitoredStates = [];
                    }

                    // Check if already monitoring
                    if (user.monitoredStates.includes(state)) {
                        return {
                            success: false,
                            message: "Already monitoring this state"
                        };
                    }

                    // Add state to monitored list
                    user.monitoredStates.push(state);

                    // Automatically enable localSigningEvents email preference
                    user.set('emailPreferences.localSigningEvents', true);
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

                    if (!user.monitoredStates || !user.monitoredStates.includes(state)) {
                        return {
                            success: false,
                            message: "Not monitoring this state"
                        };
                    }

                    // Remove state from monitored list
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
        scanUrlForArtists: {
            type: ScanUrlResultType,
            args: {
                url: { type: GraphQLNonNull(GraphQLString) }
            },
            async resolve(parent, { url }, context) {
                // Require admin privileges
                requireAdmin(context.isAuthenticated, context.userRole);

                try {
                    const { text, finalUrl, images } = await renderPageText(url);

                    const corpus = await Artist.find()
                        .select('name alternate_names')
                        .lean();

                    const matches = findArtistMatches(text, corpus as any, images);
                    const byName = new Map(corpus.map((a: any) => [a.name, a._id]));

                    return {
                        matches: matches.map(m => ({ ...m, artistId: byName.get(m.name) })),
                        scannedTextLength: text.length,
                        scannedUrl: finalUrl,
                    };
                } catch (err) {
                    throw new Error(err.message || "Failed to scan URL");
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

                    // If the article is being published for the first time, create an ArtistChange entry per artist
                    if (isPublished && !existingNewsReview.isPublished) {
                        const names: string[] =
                            newsReview.artistNames?.length > 0
                                ? newsReview.artistNames
                                : newsReview.artistName
                                ? [newsReview.artistName]
                                : [];

                        for (const artistName of names) {
                            await ArtistChange.create({
                                artistName,
                                changeType: 'news_article',
                                newsArticleId: newsReview._id.toString(),
                                newsArticleTitle: newsReview.title,
                                newsArticleSummary: newsReview.summary,
                                timestamp: new Date(),
                                processed: false,
                            });
                        }
                        console.log(`Created ${names.length} ArtistChange entry(s) for published article: ${newsReview.title}`);
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
                // Group orders change one row at a time through their own mutations; a whole-batch
                // save would overwrite participants' cards.
                if (await SigningBatch.exists({ userId: context.userId, batchId, groupOrder: { $ne: null } })) {
                    throw new Error("Group orders can't be saved from the Signing Tracker.");
                }
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
                    // Group orders are cancelled, not deleted, since other people's cards are in them.
                    await SigningBatch.deleteOne({ userId: context.userId, batchId, groupOrder: null });
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
                placement:  { type: GraphQLString },
            },
            async resolve(_parent, { artistName, platform, cardName, cardSet, placement }) {
                const validPlatforms = ['manapool', 'tcgplayer', 'cardkingdom'];
                if (!validPlatforms.includes(platform)) {
                    return { success: false, message: "Invalid platform" };
                }
                const validPlacements = ['allcards', 'artist_page', 'breakdown', 'event', 'wishlist'];
                try {
                    await PriceClick.create({
                        artistName, platform, cardName, cardSet,
                        placement: validPlacements.includes(placement) ? placement : undefined,
                    });
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
        logPageView: {
            type: MutationResponseType,
            args: {
                path: { type: GraphQLNonNull(GraphQLString) },
            },
            async resolve(_parent, { path }) {
                try {
                    await PageView.create({ path });
                    return { success: true };
                } catch (err: any) {
                    return { success: false, message: err.message || "Failed to log page view" };
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
        submitSigningReport: {
            type: SigningReportType,
            args: {
                artistName: { type: GraphQLNonNull(GraphQLString) },
                input:      { type: GraphQLNonNull(SigningReportInput) },
            },
            async resolve(_parent, { artistName, input }, context) {
                requireAuth(context.isAuthenticated);

                const artist = await Artist.findOne({ name: artistName }).collation({ locale: 'en', strength: 1 }).lean();
                if (!artist) throw new Error("Artist not found.");

                const clean = validateSigningReport(input);
                if (clean.eventId && (!isValidObjectId(clean.eventId) || !(await SigningEvent.exists({ _id: clean.eventId })))) {
                    delete clean.eventId;
                }

                const now = Date.now();
                const [last24h, forArtist, approvedByUser] = await Promise.all([
                    SigningReport.countDocuments({ userId: context.userId, createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) } }),
                    SigningReport.countDocuments({
                        userId: context.userId,
                        artistName: artist.name,
                        createdAt: { $gte: new Date(now - PER_ARTIST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) },
                    }),
                    SigningReport.countDocuments({ userId: context.userId, status: 'approved' }),
                ]);
                const limitMessage = rateLimitMessage(last24h, forArtist);
                if (limitMessage) throw new Error(limitMessage);

                const { medianPrice } = await loadSigningSummary(artist.name);
                const status = needsReview(clean, approvedByUser, medianPrice) ? 'pending' : 'approved';
                const report = await SigningReport.create({
                    ...clean,
                    artistName: artist.name,
                    userId: context.userId,
                    status,
                    ...(status === 'approved' && { reviewedAt: new Date() }),
                });
                if (status === 'approved') cacheDelete(signingSummaryKey(artist.name));
                return report;
            },
        },
        reviewSigningReport: {
            type: MutationResponseType,
            args: {
                id:              { type: GraphQLNonNull(GraphQLID) },
                status:          { type: GraphQLNonNull(GraphQLString) },
                rejectionReason: { type: GraphQLString },
            },
            async resolve(_parent, { id, status, rejectionReason }, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
                if (status !== 'approved' && status !== 'rejected') {
                    return { success: false, message: "Status must be approved or rejected" };
                }
                try {
                    const report = await SigningReport.findByIdAndUpdate(id, {
                        $set: {
                            status,
                            rejectionReason: status === 'rejected' ? rejectionReason || undefined : undefined,
                            reviewedAt: new Date(),
                            reviewedBy: context.userId,
                        },
                    });
                    if (!report) return { success: false, message: "Report not found" };
                    cacheDelete(signingSummaryKey(report.artistName));
                    return { success: true };
                } catch (err: any) {
                    return { success: false, message: err.message || "Failed to review report" };
                }
            },
        },
        deleteMySigningReport: {
            type: MutationResponseType,
            args: { id: { type: GraphQLNonNull(GraphQLID) } },
            async resolve(_parent, { id }, context) {
                requireAuth(context.isAuthenticated);
                try {
                    const report = await SigningReport.findOne({ _id: id, userId: context.userId });
                    if (!report) return { success: false, message: "Report not found" };
                    await report.deleteOne();
                    cacheDelete(signingSummaryKey(report.artistName));
                    return { success: true };
                } catch (err: any) {
                    return { success: false, message: err.message || "Failed to delete report" };
                }
            },
        },
        deleteSigningReport: {
            type: MutationResponseType,
            args: { id: { type: GraphQLNonNull(GraphQLID) } },
            async resolve(_parent, { id }, context) {
                requireAdmin(context.isAuthenticated, context.userRole);
                try {
                    const report = await SigningReport.findByIdAndDelete(id);
                    if (!report) return { success: false, message: "Report not found" };
                    cacheDelete(signingSummaryKey(report.artistName));
                    return { success: true };
                } catch (err: any) {
                    return { success: false, message: err.message || "Failed to delete report" };
                }
            },
        },
    },
});

export default new GraphQLSchema({ query: RootQuery, mutation: mutations });
