"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsReviewType = exports.PresignedUrlType = exports.UserCardCollectionItemType = exports.ArtistPostType = exports.ArtistChangeType = exports.MutationResponseType = exports.CardKingdomPriceType = exports.CardPriceType = exports.MapArtistToEventType = exports.SigningEventType = exports.AuthResponseType = exports.UserType = exports.EmailPreferencesType = exports.ArtistType = void 0;
const graphql_1 = require("graphql");
exports.ArtistType = new graphql_1.GraphQLObjectType({
    name: "ArtistType",
    fields: () => ({
        id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        email: { type: graphql_1.GraphQLString },
        artistProofs: { type: graphql_1.GraphQLString, default: false },
        facebook: { type: graphql_1.GraphQLString },
        haveSignature: { type: graphql_1.GraphQLString, default: false },
        instagram: { type: graphql_1.GraphQLString },
        patreon: { type: graphql_1.GraphQLString },
        signing: { type: graphql_1.GraphQLString, default: false },
        signingComment: { type: graphql_1.GraphQLString },
        twitter: { type: graphql_1.GraphQLString },
        url: { type: graphql_1.GraphQLString },
        youtube: { type: graphql_1.GraphQLString },
        mountainmage: { type: graphql_1.GraphQLString, default: "false" },
        markssignatureservice: { type: graphql_1.GraphQLString, default: false },
        filename: { type: graphql_1.GraphQLString },
        artstation: { type: graphql_1.GraphQLString },
        location: { type: graphql_1.GraphQLString },
        bluesky: { type: graphql_1.GraphQLString },
        omalink: { type: graphql_1.GraphQLString },
        inprnt: { type: graphql_1.GraphQLString },
        alternate_names: { type: graphql_1.GraphQLString }
    }),
});
exports.EmailPreferencesType = new graphql_1.GraphQLObjectType({
    name: "EmailPreferencesType",
    fields: () => ({
        siteUpdates: { type: graphql_1.GraphQLBoolean },
        artistUpdates: { type: graphql_1.GraphQLBoolean },
        localSigningEvents: { type: graphql_1.GraphQLBoolean },
        newArtistNotifications: { type: graphql_1.GraphQLBoolean },
    }),
});
exports.UserType = new graphql_1.GraphQLObjectType({
    name: "UserType",
    fields: () => ({
        id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        email: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        role: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        emailPreferences: { type: exports.EmailPreferencesType },
        followedArtists: { type: (0, graphql_1.GraphQLList)(graphql_1.GraphQLString) },
        monitoredStates: { type: (0, graphql_1.GraphQLList)(graphql_1.GraphQLString) },
    }),
});
exports.AuthResponseType = new graphql_1.GraphQLObjectType({
    name: "AuthResponseType",
    fields: () => ({
        token: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        user: { type: (0, graphql_1.GraphQLNonNull)(exports.UserType) },
    }),
});
exports.SigningEventType = new graphql_1.GraphQLObjectType({
    name: "SigningEventType",
    fields: () => ({
        id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        city: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        state: { type: graphql_1.GraphQLString },
        startDate: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        endDate: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        url: { type: graphql_1.GraphQLString },
    }),
});
exports.MapArtistToEventType = new graphql_1.GraphQLObjectType({
    name: "MapArtistToEventType",
    fields: () => ({
        id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        artistName: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        eventId: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
    }),
});
exports.CardPriceType = new graphql_1.GraphQLObjectType({
    name: "CardPriceType",
    fields: () => ({
        id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        set_code: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        number: { type: graphql_1.GraphQLString },
        scryfall_id: { type: graphql_1.GraphQLString },
        price_cents: { type: graphql_1.GraphQLInt },
        price_cents_lp_plus: { type: graphql_1.GraphQLInt },
        price_cents_nm: { type: graphql_1.GraphQLInt },
        price_cents_foil: { type: graphql_1.GraphQLInt },
        url: { type: graphql_1.GraphQLString },
    }),
});
exports.CardKingdomPriceType = new graphql_1.GraphQLObjectType({
    name: "CardKingdomPriceType",
    fields: () => ({
        id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        edition: { type: graphql_1.GraphQLString },
        condition: { type: graphql_1.GraphQLString },
        language: { type: graphql_1.GraphQLString },
        foil: { type: graphql_1.GraphQLBoolean },
        signed: { type: graphql_1.GraphQLBoolean },
        artistProof: { type: graphql_1.GraphQLBoolean },
        alteredArt: { type: graphql_1.GraphQLBoolean },
        misprint: { type: graphql_1.GraphQLBoolean },
        promo: { type: graphql_1.GraphQLBoolean },
        textless: { type: graphql_1.GraphQLBoolean },
        printingId: { type: graphql_1.GraphQLInt },
        scryfallId: { type: graphql_1.GraphQLString },
        price: { type: graphql_1.GraphQLInt },
        url: { type: graphql_1.GraphQLString },
    }),
});
exports.MutationResponseType = new graphql_1.GraphQLObjectType({
    name: "MutationResponseType",
    fields: () => ({
        success: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLBoolean) },
        message: { type: graphql_1.GraphQLString },
    }),
});
exports.ArtistChangeType = new graphql_1.GraphQLObjectType({
    name: "ArtistChangeType",
    fields: () => ({
        id: { type: graphql_1.GraphQLID },
        artistName: { type: graphql_1.GraphQLString },
        changeType: { type: graphql_1.GraphQLString },
        timestamp: { type: graphql_1.GraphQLString },
        fieldsChanged: { type: new graphql_1.GraphQLList(graphql_1.GraphQLString) },
        eventId: { type: graphql_1.GraphQLString },
        eventName: { type: graphql_1.GraphQLString },
        eventStartDate: { type: graphql_1.GraphQLString },
        eventEndDate: { type: graphql_1.GraphQLString },
        eventLocation: { type: graphql_1.GraphQLString },
        processed: { type: graphql_1.GraphQLBoolean },
        processedAt: { type: graphql_1.GraphQLString },
    }),
});
exports.ArtistPostType = new graphql_1.GraphQLObjectType({
    name: "ArtistPostType",
    fields: () => ({
        id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        artistId: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        artistName: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        platform: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        externalPostId: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        content: { type: graphql_1.GraphQLString },
        postUrl: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        postDate: { type: graphql_1.GraphQLString },
        fetchedAt: { type: graphql_1.GraphQLString },
        isReviewed: { type: graphql_1.GraphQLBoolean },
    }),
});
exports.UserCardCollectionItemType = new graphql_1.GraphQLObjectType({
    name: "UserCardCollectionItemType",
    fields: () => ({
        id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        scryfallId: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        cardName: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        artistName: { type: graphql_1.GraphQLString },
        set: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        collectorNumber: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        signedNonfoil: { type: graphql_1.GraphQLBoolean },
        signedFoil: { type: graphql_1.GraphQLBoolean },
        wishlistSigned: { type: graphql_1.GraphQLBoolean },
        artistProof: { type: graphql_1.GraphQLBoolean },
        artistProofFoil: { type: graphql_1.GraphQLBoolean },
    }),
});
exports.PresignedUrlType = new graphql_1.GraphQLObjectType({
    name: "PresignedUrlType",
    fields: () => ({
        uploadUrl: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        imageUrl: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        key: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
    }),
});
exports.NewsReviewType = new graphql_1.GraphQLObjectType({
    name: "NewsReviewType",
    fields: () => ({
        id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        artistPostId: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        // Legacy single artist fields (for backwards compatibility)
        artistId: {
            type: graphql_1.GraphQLID,
            resolve: (parent) => {
                // Return legacy field or first from array
                if (parent.artistId)
                    return parent.artistId;
                if (parent.artistIds && parent.artistIds.length > 0)
                    return parent.artistIds[0];
                return null;
            }
        },
        artistName: {
            type: graphql_1.GraphQLString,
            resolve: (parent) => {
                // Return legacy field or first from array
                if (parent.artistName)
                    return parent.artistName;
                if (parent.artistNames && parent.artistNames.length > 0)
                    return parent.artistNames[0];
                return null;
            }
        },
        // New multi-artist fields
        artistIds: { type: (0, graphql_1.GraphQLList)(graphql_1.GraphQLID) },
        artistNames: { type: (0, graphql_1.GraphQLList)(graphql_1.GraphQLString) },
        title: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        content: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        summary: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        sourcePostUrl: { type: graphql_1.GraphQLString },
        imageUrl: { type: graphql_1.GraphQLString },
        generatedAt: {
            type: graphql_1.GraphQLString,
            resolve: (parent) => parent.generatedAt ? new Date(parent.generatedAt).toISOString() : null
        },
        isReviewed: { type: graphql_1.GraphQLBoolean },
        isPublished: { type: graphql_1.GraphQLBoolean },
        publishedAt: {
            type: graphql_1.GraphQLString,
            resolve: (parent) => parent.publishedAt ? new Date(parent.publishedAt).toISOString() : null
        },
    }),
});
//# sourceMappingURL=schema.js.map