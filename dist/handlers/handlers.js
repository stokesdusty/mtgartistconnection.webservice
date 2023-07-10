"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
const schema_1 = require("../schema/schema");
const Artist_1 = __importDefault(require("../models/Artist"));
const RootQuery = new graphql_1.GraphQLObjectType({
    name: "RootQuery",
    fields: {
        // Get all artists
        artists: {
            type: (0, graphql_1.GraphQLList)(schema_1.ArtistType),
            async resolve() {
                return await Artist_1.default.find();
            },
        },
    },
});
const mutations = new graphql_1.GraphQLObjectType({
    name: "mutations",
    fields: {
        // add artist
        addArtist: {
            type: schema_1.ArtistType,
            args: {
                id: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLID) },
                name: { type: (0, graphql_1.GraphQLNonNull)(graphql_1.GraphQLString) },
                email: { type: graphql_1.GraphQLString },
                artistProofs: { type: graphql_1.GraphQLBoolean },
                facebook: { type: graphql_1.GraphQLString },
                haveSignature: { type: graphql_1.GraphQLBoolean },
                instagram: { type: graphql_1.GraphQLString },
                patreon: { type: graphql_1.GraphQLString },
                signing: { type: graphql_1.GraphQLBoolean },
                signingComment: { type: graphql_1.GraphQLString },
                twitter: { type: graphql_1.GraphQLString },
                url: { type: graphql_1.GraphQLString },
                youtube: { type: graphql_1.GraphQLString },
                mountainmage: { type: graphql_1.GraphQLString },
                markssignatureservice: { type: graphql_1.GraphQLBoolean },
                filename: { type: graphql_1.GraphQLString },
            },
            async resolve(parent, { id, name, email, artistProofs, facebook, haveSignature, instagram, patreon, signing, signingComment, twitter, url, youtube, mountainmage, markssignatureservice, filename, }) {
                let existingArtist;
                try {
                    existingArtist = await Artist_1.default.findOne({ name });
                    if (existingArtist)
                        return new Error("Artist already exists");
                    const artist = new Artist_1.default({
                        id,
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
                        filename
                    });
                    return await artist.save();
                }
                catch (err) {
                    return new Error("Artist Signup Failed. Try again.");
                }
            },
        },
    },
});
exports.default = new graphql_1.GraphQLSchema({ query: RootQuery, mutation: mutations });
//# sourceMappingURL=handlers.js.map