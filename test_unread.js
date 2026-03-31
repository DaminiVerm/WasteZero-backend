import dotenv from 'dotenv';
dotenv.config();
import('./config/db.js').then(async (db) => {
  await db.default();
  const Message = (await import('./model/messages.js')).default;
  const msgs = await Message.find({});
  console.log('All messages count:', msgs.length);
  const unread = await Message.aggregate([
    { $match: { isRead: { $ne: true } } },
    { $group: { _id: '$senderId', count: { $sum: 1 } } }
  ]);
  console.log('UNREAD COUNTS:', unread);
  process.exit(0);
});
