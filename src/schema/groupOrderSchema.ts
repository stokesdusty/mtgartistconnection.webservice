import { GraphQLBoolean, GraphQLFieldConfigMap, GraphQLFloat, GraphQLID, GraphQLInputObjectType, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLString } from "graphql";
import SigningEvent from "../models/SigningEvent";
import { isoDate, SigningCardRowType, SigningEventType } from "./schema";

// Group orders ("signing runs"). Resolvers return the plain view objects built in
// services/groupOrderViews.ts, which decide what each kind of viewer may see.

const nonNullList = (type: any) => GraphQLNonNull(GraphQLList(GraphQLNonNull(type)));

export const GroupOrderSignatureType = new GraphQLObjectType({
    name: "GroupOrderSignatureType",
    fields: () => ({
        id:    { type: GraphQLNonNull(GraphQLString) },
        label: { type: GraphQLNonNull(GraphQLString) },
    }),
});

export const GroupOrderPriceType = new GraphQLObjectType({
    name: "GroupOrderPriceType",
    fields: () => ({
        signatureTypeId: { type: GraphQLNonNull(GraphQLString) },
        price:           { type: GraphQLFloat },   // null = TBD
    }),
});

export const GroupOrderArtistType = new GraphQLObjectType({
    name: "GroupOrderArtistType",
    fields: () => ({
        name:      { type: GraphQLNonNull(GraphQLString) },
        cap:       { type: GraphQLInt },
        prices:    { type: nonNullList(GroupOrderPriceType) },
        used:      { type: GraphQLNonNull(GraphQLInt) },
        remaining: { type: GraphQLInt },          // null = no cap
    }),
});

export const GroupOrderReturnOptionType = new GraphQLObjectType({
    name: "GroupOrderReturnOptionType",
    fields: () => ({
        id:    { type: GraphQLNonNull(GraphQLString) },
        label: { type: GraphQLNonNull(GraphQLString) },
        price: { type: GraphQLNonNull(GraphQLFloat) },
    }),
});

export const GroupOrderBalanceType = new GraphQLObjectType({
    name: "GroupOrderBalanceType",
    fields: () => ({
        cardsTotal:       { type: GraphQLNonNull(GraphQLFloat) },
        customItemsTotal: { type: GraphQLNonNull(GraphQLFloat) },
        fee:              { type: GraphQLNonNull(GraphQLFloat) },
        returnShipping:   { type: GraphQLNonNull(GraphQLFloat) },
        pendingCount:     { type: GraphQLNonNull(GraphQLInt) },
        due:              { type: GraphQLFloat },  // null while any price is pending
        confirmedPaid:    { type: GraphQLNonNull(GraphQLFloat) },
        reportedPaid:     { type: GraphQLNonNull(GraphQLFloat) },
        remaining:        { type: GraphQLFloat },  // negative = owed a refund
        status:           { type: GraphQLNonNull(GraphQLString) },
    }),
});

export const GroupOrderPaymentType = new GraphQLObjectType({
    name: "GroupOrderPaymentType",
    fields: () => ({
        id:          { type: GraphQLNonNull(GraphQLString) },
        amount:      { type: GraphQLNonNull(GraphQLFloat) },
        note:        { type: GraphQLString },
        source:      { type: GraphQLNonNull(GraphQLString) },
        createdAt:   isoDate('createdAt'),
        confirmedAt: isoDate('confirmedAt'),
    }),
});

export const GroupOrderCustomItemType = new GraphQLObjectType({
    name: "GroupOrderCustomItemType",
    fields: () => ({
        id:         { type: GraphQLNonNull(GraphQLString) },
        label:      { type: GraphQLNonNull(GraphQLString) },
        artistName: { type: GraphQLString },
        quantity:   { type: GraphQLNonNull(GraphQLInt) },
        price:      { type: GraphQLFloat },
        status:     { type: GraphQLNonNull(GraphQLString) },
        note:       { type: GraphQLString },
    }),
});

export const GroupOrderParticipantType = new GraphQLObjectType({
    name: "GroupOrderParticipantType",
    fields: () => ({
        id:               { type: GraphQLNonNull(GraphQLID) },
        isGuest:          { type: GraphQLNonNull(GraphQLBoolean) },
        displayName:      { type: GraphQLNonNull(GraphQLString) },
        discordName:      { type: GraphQLString },
        status:           { type: GraphQLNonNull(GraphQLString) },
        cardCount:        { type: GraphQLNonNull(GraphQLInt) },
        balance:          { type: GraphQLNonNull(GroupOrderBalanceType) },
        payments:         { type: nonNullList(GroupOrderPaymentType) },
        customItems:      { type: nonNullList(GroupOrderCustomItemType) },
        readyToShipAt:    isoDate('readyToShipAt'),
        sheetChanged:     { type: GraphQLNonNull(GraphQLBoolean) },
        mismatchCount:    { type: GraphQLNonNull(GraphQLInt) },
        emailOptOut:      { type: GraphQLBoolean },
        inboundTracking:  { type: GraphQLString },
        receivedAt:       isoDate('receivedAt'),
        returnOptionId:   { type: GraphQLString },
        returnTracking:   { type: GraphQLString },
        notesToOrganizer: { type: GraphQLString },
        termsAcceptedAt:  isoDate('termsAcceptedAt'),
        createdAt:        isoDate('createdAt'),
    }),
});

/** Fields every view of an order has. */
const orderFields = (): GraphQLFieldConfigMap<any, any> => ({
    id:                     { type: GraphQLNonNull(GraphQLID) },
    name:                   { type: GraphQLNonNull(GraphQLString) },
    status:                 { type: GraphQLNonNull(GraphQLString) },   // effective: an open order past its cutoff reads "closed"
    paymentTiming:          { type: GraphQLNonNull(GraphQLString) },
    paymentDue:             { type: GraphQLNonNull(GraphQLBoolean) },
    disabled:               { type: GraphQLNonNull(GraphQLBoolean) },   // by an admin
    disabledReason:         { type: GraphQLString },
    eventId:                { type: GraphQLID },
    event: {
        type: SigningEventType,
        resolve: (order: any) => order.eventId ? SigningEvent.findById(order.eventId).lean() : null,
    },
    organizerDiscordName:   { type: GraphQLString },
    publicTerms:            { type: GraphQLString },
    cutoff:                 isoDate('cutoff'),
    maxCardsPerParticipant: { type: GraphQLInt },
    participantFee:         { type: GraphQLNonNull(GraphQLFloat) },
    returnOptions:          { type: nonNullList(GroupOrderReturnOptionType) },
    signatureTypes:         { type: nonNullList(GroupOrderSignatureType) },
    artists:                { type: nonNullList(GroupOrderArtistType) },
});

export const GroupOrderInviteType = new GraphQLObjectType({
    name: "GroupOrderInviteType",
    fields: () => ({
        ...orderFields(),
        viewerStatus: { type: GraphQLString },   // 'organizer', the viewer's membership status, or null
    }),
});

export const OrganizerGroupOrderType = new GraphQLObjectType({
    name: "OrganizerGroupOrderType",
    fields: () => ({
        ...orderFields(),
        savedStatus:         { type: GraphQLNonNull(GraphQLString) },
        organizerEmailOptOut: { type: GraphQLNonNull(GraphQLBoolean) },
        inviteToken:         { type: GraphQLString },   // null = link revoked
        privateInstructions: { type: GraphQLString },
        rows:                { type: nonNullList(SigningCardRowType) },
        participants:        { type: nonNullList(GroupOrderParticipantType) },
    }),
});

export const ParticipantGroupOrderType = new GraphQLObjectType({
    name: "ParticipantGroupOrderType",
    fields: () => ({
        ...orderFields(),
        privateInstructions: { type: GraphQLString },   // null until approved
        rows:                { type: nonNullList(SigningCardRowType) },
        me:                  { type: GraphQLNonNull(GroupOrderParticipantType) },
    }),
});

// ─── Inputs ──────────────────────────────────────────────────────────────────

const SignatureTypeInput = new GraphQLInputObjectType({
    name: "GroupOrderSignatureTypeInput",
    fields: {
        id:    { type: GraphQLNonNull(GraphQLString) },
        label: { type: GraphQLNonNull(GraphQLString) },
    },
});

const PriceInput = new GraphQLInputObjectType({
    name: "GroupOrderPriceInput",
    fields: {
        signatureTypeId: { type: GraphQLNonNull(GraphQLString) },
        price:           { type: GraphQLFloat },
    },
});

const ArtistInput = new GraphQLInputObjectType({
    name: "GroupOrderArtistInput",
    fields: {
        name:   { type: GraphQLNonNull(GraphQLString) },
        cap:    { type: GraphQLInt },
        prices: { type: nonNullList(PriceInput) },
    },
});

const ReturnOptionInput = new GraphQLInputObjectType({
    name: "GroupOrderReturnOptionInput",
    fields: {
        id:    { type: GraphQLNonNull(GraphQLString) },
        label: { type: GraphQLNonNull(GraphQLString) },
        price: { type: GraphQLNonNull(GraphQLFloat) },
    },
});

/** A card in a group order. Its price always comes from the order's grid. */
export const GroupOrderRowInput = new GraphQLInputObjectType({
    name: "GroupOrderRowInput",
    fields: {
        artist:          { type: GraphQLNonNull(GraphQLString) },
        signatureTypeId: { type: GraphQLNonNull(GraphQLString) },
        quantity:        { type: GraphQLNonNull(GraphQLInt) },
        cardName:        { type: GraphQLString },
        set:             { type: GraphQLString },
        foil:            { type: GraphQLString },
        sigNotes:        { type: GraphQLString },
    },
});

/** Something the organizer buys for a participant: an artist proof, print, playmat... */
export const GroupOrderCustomItemInput = new GraphQLInputObjectType({
    name: "GroupOrderCustomItemInput",
    fields: {
        label:      { type: GraphQLNonNull(GraphQLString) },
        artistName: { type: GraphQLString },
        quantity:   { type: GraphQLNonNull(GraphQLInt) },
        price:      { type: GraphQLFloat },   // null while pending
        status:     { type: GraphQLString },  // requested / purchased / unavailable
        note:       { type: GraphQLString },
    },
});

/** How many of a card arrived in a participant's package. */
export const GroupOrderCheckInInput = new GraphQLInputObjectType({
    name: "GroupOrderCheckInInput",
    fields: {
        rowId:            { type: GraphQLNonNull(GraphQLString) },
        receivedQuantity: { type: GraphQLNonNull(GraphQLInt) },
    },
});

export const GroupOrderSettingsInput = new GraphQLInputObjectType({
    name: "GroupOrderSettingsInput",
    fields: {
        signatureTypes:         { type: nonNullList(SignatureTypeInput) },
        artists:                { type: nonNullList(ArtistInput) },
        participantFee:         { type: GraphQLFloat },
        returnOptions:          { type: GraphQLList(GraphQLNonNull(ReturnOptionInput)) },
        cutoff:                 { type: GraphQLString },
        maxCardsPerParticipant: { type: GraphQLInt },
        paymentTiming:          { type: GraphQLNonNull(GraphQLString) },
        publicTerms:            { type: GraphQLString },
        privateInstructions:    { type: GraphQLString },
        organizerDiscordName:   { type: GraphQLString },
    },
});
