import { GraphQLID, GraphQLObjectType, GraphQLString, GraphQLNonNull, GraphQLBoolean } from "graphql";

export const ArtistType = new GraphQLObjectType({
    name: "ArtistType",
    fields: () => ({
        id: { type: GraphQLNonNull(GraphQLID) },
        name: { type: GraphQLNonNull(GraphQLString) },
        email: { type: GraphQLString },
        artistProofs: { type: GraphQLBoolean,  default: false },
        facebook: { type: GraphQLString },
        haveSignature: { type: GraphQLBoolean, default: false },
        instagram: { type: GraphQLString },
        patreon: { type: GraphQLString }, 
        signing: { type: GraphQLBoolean, default: false },
        signingComment: { type: GraphQLString },
        twitter: { type: GraphQLString },
        url: { type: GraphQLString },
        youtube: { type: GraphQLString },
        mountainmage: { type: GraphQLString, default: "false" },
        markssignatureservice: { type: GraphQLBoolean, default: false },
        filename: { type: GraphQLString },
    }),
});
