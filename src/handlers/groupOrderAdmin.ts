import { GraphQLBoolean, GraphQLFieldConfigMap, GraphQLID, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLString } from "graphql";
import GroupOrderParticipant from "../models/GroupOrderParticipant";
import GroupOrderReport from "../models/GroupOrderReport";
import SigningBatch from "../models/SigningBatch";
import User from "../models/User";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { isoDate, MutationResponseType } from "../schema/schema";
import { cleanText } from "../services/groupOrders";
import { notifyAdminsOfReport, notifyInBackground } from "../services/groupOrderNotifications";
import { isDuplicateKey, loadOrganizerOrder, notFound, objectId } from "./groupOrderAccess";

// Trust and safety for group orders: anyone can report an order, admins review reports and
// can disable an order (read-only, invite link off). Organizers can delete drafts and
// cancelled orders that never received cards.

const MIN_REASON = 10;
const MAX_REASON = 1000;

const GroupOrderReportType = new GraphQLObjectType({
    name: "GroupOrderReportType",
    fields: () => ({
        id:            { type: GraphQLNonNull(GraphQLID) },
        reason:        { type: GraphQLNonNull(GraphQLString) },
        reporterName:  { type: GraphQLString },
        reporterEmail: { type: GraphQLString },
        createdAt:     isoDate('createdAt'),
        resolvedAt:    isoDate('resolvedAt'),
    }),
});

/** Admin-only summary of an order: who runs it, how big it is, and its reports. */
const AdminGroupOrderType = new GraphQLObjectType({
    name: "AdminGroupOrderType",
    fields: () => ({
        id:                   { type: GraphQLNonNull(GraphQLID) },
        name:                 { type: GraphQLNonNull(GraphQLString) },
        status:               { type: GraphQLNonNull(GraphQLString) },
        createdAt:            { type: GraphQLString },
        organizerName:        { type: GraphQLString },
        organizerEmail:       { type: GraphQLString },
        organizerDiscordName: { type: GraphQLString },
        inviteToken:          { type: GraphQLString },
        participantCount:     { type: GraphQLNonNull(GraphQLInt) },
        cardCount:            { type: GraphQLNonNull(GraphQLInt) },
        openReportCount:      { type: GraphQLNonNull(GraphQLInt) },
        reports:              { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(GroupOrderReportType))) },
        disabled:             { type: GraphQLNonNull(GraphQLBoolean) },
        disabledReason:       { type: GraphQLString },
    }),
});

async function adminView(batchIds: unknown[]) {
    const [batches, participants, reports] = await Promise.all([
        SigningBatch.find({ _id: { $in: batchIds }, groupOrder: { $ne: null } }).lean(),
        GroupOrderParticipant.find({ orderId: { $in: batchIds }, status: 'approved' }).select('orderId').lean(),
        GroupOrderReport.find({ orderId: { $in: batchIds } }).sort({ createdAt: -1 }).lean(),
    ]);
    const people = await User.find({ _id: { $in: [...batches.map((b) => b.userId), ...reports.map((r) => r.reporterId)] } }).select('name email').lean();
    const person = (id: unknown) => people.find((p) => String(p._id) === String(id));

    return batches.map((b) => {
        const theirReports = reports.filter((r) => String(r.orderId) === String(b._id));
        return {
            id: String(b._id),
            name: b.name,
            status: b.groupOrder!.status,
            createdAt: b.createdAt,
            organizerName: person(b.userId)?.name ?? null,
            organizerEmail: person(b.userId)?.email ?? null,
            organizerDiscordName: b.groupOrder!.organizerDiscordName,
            inviteToken: b.groupOrder!.inviteToken,
            participantCount: participants.filter((p) => String(p.orderId) === String(b._id)).length,
            cardCount: b.rows.reduce((sum, r) => sum + (r.quantity ?? 0), 0),
            openReportCount: theirReports.filter((r) => !r.resolvedAt).length,
            reports: theirReports.map((r) => ({
                ...r,
                id: String(r._id),
                reporterName: person(r.reporterId)?.name ?? null,
                reporterEmail: person(r.reporterId)?.email ?? null,
            })),
            disabled: !!b.groupOrder!.disabledAt,
            disabledReason: b.groupOrder!.disabledReason || null,
        };
    });
}

const reloadAdmin = async (orderId: unknown) => (await adminView([orderId]))[0] ?? null;

export const groupOrderAdminQueries: GraphQLFieldConfigMap<any, any> = {
    /** Reported orders first, then the newest. */
    adminGroupOrders: {
        type: GraphQLList(AdminGroupOrderType),
        args: { reportedOnly: { type: GraphQLBoolean } },
        async resolve(_parent, { reportedOnly }, context) {
            requireAdmin(context.isAuthenticated, context.userRole);
            const reportedIds = await GroupOrderReport.distinct('orderId');
            const ids = reportedOnly
                ? reportedIds
                : (await SigningBatch.find({ groupOrder: { $ne: null } }).sort({ _id: -1 }).limit(200).select('_id').lean()).map((b) => b._id);
            const orders = await adminView(ids);
            return orders.sort((a, b) => b.openReportCount - a.openReportCount || (a.id < b.id ? 1 : -1));
        },
    },
};

export const groupOrderAdminMutations: GraphQLFieldConfigMap<any, any> = {
    /** Anyone logged in can report an order (except its organizer), once. Admins are emailed. */
    reportGroupOrder: {
        type: MutationResponseType,
        args: {
            orderId: { type: GraphQLNonNull(GraphQLID) },
            reason:  { type: GraphQLNonNull(GraphQLString) },
        },
        async resolve(_parent, { orderId, reason }, context) {
            requireAuth(context.isAuthenticated);
            const clean = cleanText(reason, 'The report', MAX_REASON);
            if (clean.length < MIN_REASON) throw new Error("Tell us what's wrong in a sentence or two.");
            const batch = await SigningBatch.findOne({ _id: objectId(orderId), groupOrder: { $ne: null } }).select('userId groupOrder.status').lean();
            if (!batch || batch.groupOrder?.status === 'draft') throw notFound();
            if (String(batch.userId) === String(context.userId)) throw new Error("You can't report your own order.");
            try {
                await GroupOrderReport.create({ orderId: batch._id, reporterId: context.userId, reason: clean });
            } catch (err) {
                if (isDuplicateKey(err)) throw new Error("You've already reported this order. An admin will look at it.");
                throw err;
            }
            notifyInBackground(notifyAdminsOfReport(batch._id, context.userId, clean));
            return { success: true, message: 'Thanks. An admin will look at this order.' };
        },
    },
    /** Organizers can delete drafts, and cancelled orders that never received cards and weren't reported. */
    deleteGroupOrder: {
        type: MutationResponseType,
        args: { orderId: { type: GraphQLNonNull(GraphQLID) } },
        async resolve(_parent, { orderId }, context) {
            requireAuth(context.isAuthenticated);
            const batch = await loadOrganizerOrder(orderId, context.userId);
            const { status } = batch.groupOrder;
            if (status !== 'draft' && status !== 'cancelled') throw new Error('Cancel the order before deleting it.');
            if (await GroupOrderParticipant.exists({ orderId: batch._id, receivedAt: { $ne: null } })) {
                throw new Error("You received someone's cards in this order, so it can't be deleted.");
            }
            if (await GroupOrderReport.exists({ orderId: batch._id })) throw new Error("This order was reported, so it can't be deleted.");
            await GroupOrderParticipant.deleteMany({ orderId: batch._id });
            await SigningBatch.deleteOne({ _id: batch._id, userId: context.userId });
            return { success: true };
        },
    },
    /** Admin: makes an order read-only and turns its invite link off (or back on). */
    setGroupOrderDisabled: {
        type: AdminGroupOrderType,
        args: {
            orderId:  { type: GraphQLNonNull(GraphQLID) },
            disabled: { type: GraphQLNonNull(GraphQLBoolean) },
            reason:   { type: GraphQLString },
        },
        async resolve(_parent, { orderId, disabled, reason }, context) {
            requireAdmin(context.isAuthenticated, context.userRole);
            const result = await SigningBatch.updateOne(
                { _id: objectId(orderId), groupOrder: { $ne: null } },
                { $set: { 'groupOrder.disabledAt': disabled ? new Date() : null, 'groupOrder.disabledReason': disabled ? cleanText(reason, 'The reason', 200) : '' } },
            );
            if (!result.matchedCount) throw notFound();
            return reloadAdmin(orderId);
        },
    },
    /** Admin: marks an order's open reports as reviewed. */
    resolveGroupOrderReports: {
        type: AdminGroupOrderType,
        args: { orderId: { type: GraphQLNonNull(GraphQLID) } },
        async resolve(_parent, { orderId }, context) {
            requireAdmin(context.isAuthenticated, context.userRole);
            await GroupOrderReport.updateMany({ orderId: objectId(orderId), resolvedAt: null }, { $set: { resolvedAt: new Date(), resolvedBy: context.userId } });
            return reloadAdmin(orderId);
        },
    },
};
