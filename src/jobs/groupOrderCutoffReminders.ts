import { sendCutoffReminders } from '../services/groupOrderNotifications';

// Hourly: emails approved participants about 48 hours before a group order's cutoff, once per order.
export const runGroupOrderCutoffReminders = async (): Promise<void> => {
    const covered = await sendCutoffReminders();
    if (covered) console.log(`Group order cutoff reminders sent for ${covered} ${covered === 1 ? 'order' : 'orders'}.`);
};
