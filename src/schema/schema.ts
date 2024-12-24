import { GraphQLID, GraphQLObjectType, GraphQLString, GraphQLNonNull, GraphQLScalarType } from "graphql";

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
    }),
});

export const UserType = new GraphQLObjectType({
    name: "UserType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        name: { type: GraphQLNonNull(GraphQLString) },
        email: { type: GraphQLNonNull(GraphQLString) },
        password: { type: GraphQLNonNull(GraphQLString) },
    }),
});

export const SigningEventType = new GraphQLObjectType({
    name: "SigningEventType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        name: { type: GraphQLNonNull(GraphQLString) },
        city: { type: GraphQLNonNull(GraphQLString) },
        startDate: { type: GraphQLNonNull(GraphQLString) },
        endDate: { type: GraphQLNonNull(GraphQLString) },
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