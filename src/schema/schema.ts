import { GraphQLID, GraphQLObjectType, GraphQLString, GraphQLNonNull, GraphQLScalarType, GraphQLInt, GraphQLFloat, GraphQLBoolean, GraphQLList } from "graphql";

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
        alternate_names: { type: GraphQLString },
        scryfall_name: { type: GraphQLString }
    }),
});

export const EmailPreferencesType = new GraphQLObjectType({
    name: "EmailPreferencesType",
    fields: () => ({
        siteUpdates: { type: GraphQLBoolean },
        artistUpdates: { type: GraphQLBoolean },
        localSigningEvents: { type: GraphQLBoolean },
        newArtistNotifications: { type: GraphQLBoolean },
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
        refreshToken: { type: GraphQLNonNull(GraphQLString) },
        user: { type: GraphQLNonNull(UserType) },
    }),
});

export const RefreshTokenResponseType = new GraphQLObjectType({
    name: "RefreshTokenResponseType",
    fields: () => ({
        token: { type: GraphQLNonNull(GraphQLString) },
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

export const ArtistFlagsType = new GraphQLObjectType({
    name: "ArtistFlagsType",
    fields: () => ({
        name:            { type: GraphQLNonNull(GraphQLString) },
        flags:           { type: GraphQLNonNull(GraphQLInt) },
        location:        { type: GraphQLString },
        alternate_names: { type: GraphQLString },
    }),
});

export const ArtistPageType = new GraphQLObjectType({
    name: "ArtistPageType",
    fields: () => ({
        artists: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(ArtistType))) },
        total:   { type: GraphQLNonNull(GraphQLInt) },
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

export const ArtistPostType = new GraphQLObjectType({
    name: "ArtistPostType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        artistId: { type: GraphQLNonNull(GraphQLID) },
        artistName: { type: GraphQLNonNull(GraphQLString) },
        platform: { type: GraphQLNonNull(GraphQLString) },
        externalPostId: { type: GraphQLNonNull(GraphQLString) },
        content: { type: GraphQLString },
        postUrl: { type: GraphQLNonNull(GraphQLString) },
        postDate: { type: GraphQLString },
        fetchedAt: { type: GraphQLString },
        isReviewed: { type: GraphQLBoolean },
    }),
});

export const UserCardCollectionItemType = new GraphQLObjectType({
    name: "UserCardCollectionItemType",
    fields: () => ({
        id:              { type: GraphQLNonNull(GraphQLID) },
        scryfallId:      { type: GraphQLNonNull(GraphQLString) },
        cardName:        { type: GraphQLNonNull(GraphQLString) },
        artistName:      { type: GraphQLString },
        set:             { type: GraphQLNonNull(GraphQLString) },
        collectorNumber: { type: GraphQLNonNull(GraphQLString) },
        signedNonfoil:   { type: GraphQLBoolean },
        signedFoil:      { type: GraphQLBoolean },
        wishlistSigned:  { type: GraphQLBoolean },
        artistProof:     { type: GraphQLBoolean },
        artistProofFoil: { type: GraphQLBoolean },
    }),
});

export const SigningCardRowType = new GraphQLObjectType({
    name: "SigningCardRowType",
    fields: () => ({
        rowId:             { type: GraphQLNonNull(GraphQLString) },
        cardName:          { type: GraphQLString },
        quantity:          { type: GraphQLInt },
        set:               { type: GraphQLString },
        foil:              { type: GraphQLString },
        owner:             { type: GraphQLString },
        signatureType:     { type: GraphQLString },
        sigNotes:          { type: GraphQLString },
        pricePerSig:       { type: GraphQLFloat },
        paymentStatus:     { type: GraphQLString },
        status:            { type: GraphQLString },
        signingMethod:     { type: GraphQLString },
        signingMethodLabel:{ type: GraphQLString },
        outboundTracking:  { type: GraphQLString },
        inboundTracking:   { type: GraphQLString },
    }),
});

export const SigningBatchType = new GraphQLObjectType({
    name: "SigningBatchType",
    fields: () => ({
        id:        { type: GraphQLNonNull(GraphQLID) },
        batchId:   { type: GraphQLNonNull(GraphQLString) },
        name:      { type: GraphQLNonNull(GraphQLString) },
        createdAt: { type: GraphQLNonNull(GraphQLString) },
        archived:  { type: GraphQLBoolean },
        expanded:  { type: GraphQLBoolean },
        sortOrder: { type: GraphQLInt },
        rows:      { type: GraphQLList(SigningCardRowType) },
    }),
});

export const PresignedUrlType = new GraphQLObjectType({
    name: "PresignedUrlType",
    fields: () => ({
        uploadUrl: { type: GraphQLNonNull(GraphQLString) },
        imageUrl: { type: GraphQLNonNull(GraphQLString) },
        key: { type: GraphQLNonNull(GraphQLString) },
    }),
});

export const NewsReviewType = new GraphQLObjectType({
    name: "NewsReviewType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        artistPostId: { type: GraphQLNonNull(GraphQLID) },
        // Legacy single artist fields (for backwards compatibility)
        artistId: {
            type: GraphQLID,
            resolve: (parent) => {
                // Return legacy field or first from array
                if (parent.artistId) return parent.artistId;
                if (parent.artistIds && parent.artistIds.length > 0) return parent.artistIds[0];
                return null;
            }
        },
        artistName: {
            type: GraphQLString,
            resolve: (parent) => {
                // Return legacy field or first from array
                if (parent.artistName) return parent.artistName;
                if (parent.artistNames && parent.artistNames.length > 0) return parent.artistNames[0];
                return null;
            }
        },
        // New multi-artist fields
        artistIds: { type: GraphQLList(GraphQLID) },
        artistNames: { type: GraphQLList(GraphQLString) },
        title: { type: GraphQLNonNull(GraphQLString) },
        content: { type: GraphQLNonNull(GraphQLString) },
        summary: { type: GraphQLNonNull(GraphQLString) },
        sourcePostUrl: { type: GraphQLString },
        imageUrl: { type: GraphQLString },
        generatedAt: {
            type: GraphQLString,
            resolve: (parent) => parent.generatedAt ? new Date(parent.generatedAt).toISOString() : null
        },
        isReviewed: { type: GraphQLBoolean },
        isPublished: { type: GraphQLBoolean },
        publishedAt: {
            type: GraphQLString,
            resolve: (parent) => parent.publishedAt ? new Date(parent.publishedAt).toISOString() : null
        },
    }),
});