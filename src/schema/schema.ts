import { GraphQLID, GraphQLObjectType, GraphQLString, GraphQLNonNull } from "graphql";

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
        artstation: { type: GraphQLString ,}
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