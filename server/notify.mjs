export const notify = (db, userId, text, target) =>
  db
    .prepare("INSERT INTO notifications (user_id, text, target) VALUES (?, ?, ?)")
    .run(userId, text, target);
