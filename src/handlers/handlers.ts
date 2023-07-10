import { GraphQLBoolean, GraphQLID, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { ArtistType } from "../schema/schema";
import Artist from "../models/Artist";
import { Document } from "mongoose";

type DocumentType = Document<any, any, any>;

const RootQuery = new GraphQLObjectType({
    name: "RootQuery",
    fields: {
        // Get all artists
        artists: {
            type: GraphQLList(ArtistType),
            async resolve() {
                return await Artist.find();
            },
        },
    },
});

const mutations = new GraphQLObjectType({
    name: "mutations",
    fields: {
        // add artist
        addArtist: {
            type: ArtistType,
            args: {
                id: { type: GraphQLNonNull(GraphQLID) },
                name: { type: GraphQLNonNull(GraphQLString) },
                email: { type: GraphQLString },
                artistProofs: { type: GraphQLBoolean },
                facebook: { type: GraphQLString },
                haveSignature: { type: GraphQLBoolean },
                instagram: { type: GraphQLString },
                patreon: { type: GraphQLString }, 
                signing: { type: GraphQLBoolean },
                signingComment: { type: GraphQLString },
                twitter: { type: GraphQLString },
                url: { type: GraphQLString },
                youtube: { type: GraphQLString },
                mountainmage: { type: GraphQLString },
                markssignatureservice: { type: GraphQLBoolean },
                filename: { type: GraphQLString },
            },
            async resolve(
                parent,
                {
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
                    filename,
                }
                ) {
                let existingArtist:DocumentType;
                try {
                    existingArtist = await Artist.findOne({name});
                    if(existingArtist) return new Error("Artist already exists");
                    const artist = new Artist(
                        {
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
                } catch (err) {
                    return new Error("Artist Signup Failed. Try again.");
                }
            },
        },
    },
});

export default new GraphQLSchema({ query: RootQuery, mutation: mutations });