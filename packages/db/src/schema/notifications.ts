import { pgTable, text, timestamp, uuid, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { merchants } from './merchants';
import { users } from './merchants'; // users table is defined in merchants.ts

export const notificationTypeEnum = pgEnum('notification_type', ['info', 'success', 'warning', 'error']);

export const notifications = pgTable('notifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: notificationTypeEnum('type').notNull().default('info'),
    isRead: boolean('is_read').notNull().default(false),
    actionUrl: text('action_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
