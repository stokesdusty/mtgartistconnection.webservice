"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtistChangeType = exports.MutationResponseType = exports.CardKingdomPriceType = exports.CardPriceType = exports.MapArtistToEventType = exports.SigningEventType = exports.AuthResponseType = exports.UserType = exports.EmailPreferencesType = exports.ArtistType = void 0;
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
        inprnt: { type: graphql_1.GraphQLString }
    }),
});
exports.EmailPreferencesType = new graphql_1.GraphQLObjectType({
    name: "EmailPreferencesType",
    fields: () => ({
        siteUpdates: { type: graphql_1.GraphQLBoolean },
        artistUpdates: { type: graphql_1.GraphQLBoolean },
        localSigningEvents: { type: graphql_1.GraphQLBoolean },
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
//# sourceMappingURL=schema.js.map