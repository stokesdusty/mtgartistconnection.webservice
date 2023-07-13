"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserType = exports.ArtistType = void 0;
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
        artstation: { type: graphql_1.GraphQLString, }
    }),
});
exports.UserType = new graphql_1.GraphQLObjectType({
    name: "UserType",
    fields: () => ({
        id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
        name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        email: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
        password: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
    }),
});
//# sourceMappingURL=schema.js.map