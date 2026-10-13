import { validateSchema } from 'graphql';
import schema from './handlers';

// Building the schema catches duplicate type names and bad field configs that the type
// checker can't see. The resolvers' rules are tested in services/groupOrders.test.ts.
describe('group order schema', () => {
    it('is a valid schema with the group order fields wired in', () => {
        expect(validateSchema(schema)).toEqual([]);
        expect(Object.keys(schema.getQueryType()!.getFields())).toEqual(expect.arrayContaining([
            'groupOrderByInvite', 'organizedGroupOrders', 'organizedGroupOrder', 'myGroupOrders', 'myGroupOrder',
        ]));
        expect(Object.keys(schema.getMutationType()!.getFields())).toEqual(expect.arrayContaining([
            'createGroupOrder', 'updateGroupOrder', 'setGroupOrderStatus', 'resetGroupOrderInvite', 'reviewGroupOrderRequest',
            'removeGroupOrderParticipant', 'addGroupOrderGuest', 'joinGroupOrder', 'leaveGroupOrder', 'updateDiscordName',
        ]));
    });

    it('never exposes the invite token or private instructions on the public invite type', () => {
        const fields = Object.keys((schema.getType('GroupOrderInviteType') as any).getFields());
        expect(fields).not.toContain('inviteToken');
        expect(fields).not.toContain('privateInstructions');
        expect(fields).not.toContain('participants');
        expect(fields).not.toContain('rows');
    });
});
