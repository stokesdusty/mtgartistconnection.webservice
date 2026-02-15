import { GraphQLID, GraphQLObjectType, GraphQLString, GraphQLNonNull, GraphQLScalarType, GraphQLInt, GraphQLBoolean, GraphQLList } from "graphql";

export const ArtistType = new GraphQLObjectType({
    name: "ArtistType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        name: { type: GraphQLNonNull(GraphQLString) },
        email: { type: GraphQLString },
        artistProofs: { type: GraphQLString,  default: false },
        facebook: { type: GraphQLString },
        haveSignature: { type: GraphQLString, default: false },
        instagram: { type: GraphQLString },
        patreon: { type: GraphQLString }, 
        signing: { type: GraphQLString, default: false },
        signingComment: { type: GraphQLString },
        twitter: { type: GraphQLString },
        url: { type: GraphQLString },
        youtube: { type: GraphQLString },
        mountainmage: { type: GraphQLString, default: "false" },
        markssignatureservice: { type: GraphQLString, default: false },
        filename: { type: GraphQLString },
        artstation: { type: GraphQLString },
        location: { type: GraphQLString },
        bluesky: { type: GraphQLString },
        omalink: { type: GraphQLString },
        inprnt: { type: GraphQLString },
        alternate_names: { type: GraphQLString }
    }),
});

export const EmailPreferencesType = new GraphQLObjectType({
    name: "EmailPreferencesType",
    fields: () => ({
        siteUpdates: { type: GraphQLBoolean },
        artistUpdates: { type: GraphQLBoolean },
        localSigningEvents: { type: GraphQLBoolean },
    }),
});

export const UserType = new GraphQLObjectType({
    name: "UserType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        name: { type: GraphQLNonNull(GraphQLString) },
        email: { type: GraphQLNonNull(GraphQLString) },
        role: { type: GraphQLNonNull(GraphQLString) },
        emailPreferences: { type: EmailPreferencesType },
        followedArtists: { type: GraphQLList(GraphQLString) },
        monitoredStates: { type: GraphQLList(GraphQLString) },
    }),
});

export const AuthResponseType = new GraphQLObjectType({
    name: "AuthResponseType",
    fields: () => ({
        token: { type: GraphQLNonNull(GraphQLString) },
        user: { type: GraphQLNonNull(UserType) },
    }),
});

export const SigningEventType = new GraphQLObjectType({
    name: "SigningEventType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        name: { type: GraphQLNonNull(GraphQLString) },
        city: { type: GraphQLNonNull(GraphQLString) },
        state: { type: GraphQLString },
        startDate: { type: GraphQLNonNull(GraphQLString) },
        endDate: { type: GraphQLNonNull(GraphQLString) },
        url: { type: GraphQLString },
    }),
});

export const MapArtistToEventType = new GraphQLObjectType({
    name: "MapArtistToEventType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        artistName: { type: GraphQLNonNull(GraphQLString) },
        eventId: { type: GraphQLNonNull(GraphQLString) },
    }),
});

export const CardPriceType = new GraphQLObjectType({
    name: "CardPriceType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        name: { type: GraphQLNonNull(GraphQLString) },
        set_code: { type: GraphQLNonNull(GraphQLString) },
        number: { type: GraphQLString },
        scryfall_id: { type: GraphQLString },
        price_cents: { type: GraphQLInt },
        price_cents_lp_plus: { type: GraphQLInt },
        price_cents_nm: { type: GraphQLInt },
        price_cents_foil: { type: GraphQLInt },
        url: { type: GraphQLString },
    }),
});

export const CardKingdomPriceType = new GraphQLObjectType({
    name: "CardKingdomPriceType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        name: { type: GraphQLNonNull(GraphQLString) },
        edition: { type: GraphQLString },
        condition: { type: GraphQLString },
        language: { type: GraphQLString },
        foil: { type: GraphQLBoolean },
        signed: { type: GraphQLBoolean },
        artistProof: { type: GraphQLBoolean },
        alteredArt: { type: GraphQLBoolean },
        misprint: { type: GraphQLBoolean },
        promo: { type: GraphQLBoolean },
        textless: { type: GraphQLBoolean },
        printingId: { type: GraphQLInt },
        scryfallId: { type: GraphQLString },
        price: { type: GraphQLInt },
        url: { type: GraphQLString },
    }),
});

export const MutationResponseType = new GraphQLObjectType({
    name: "MutationResponseType",
    fields: () => ({
        success: { type: GraphQLNonNull(GraphQLBoolean) },
        message: { type: GraphQLString },
    }),
});

export const ArtistChangeType = new GraphQLObjectType({
    name: "ArtistChangeType",
    fields: () => ({
        id: { type: GraphQLID },
        artistName: { type: GraphQLString },
        changeType: { type: GraphQLString },
        timestamp: { type: GraphQLString },
        fieldsChanged: { type: new GraphQLList(GraphQLString) },
        eventId: { type: GraphQLString },
        eventName: { type: GraphQLString },
        eventStartDate: { type: GraphQLString },
        eventEndDate: { type: GraphQLString },
        eventLocation: { type: GraphQLString },
        processed: { type: GraphQLBoolean },
        processedAt: { type: GraphQLString },
    }),
});