// Notificaciones del usuario autenticado.
import { Router } from "express";
import { notFound } from "../http.mjs";
import { id } from "../validate.mjs";

export default function notificationRoutes(db, auth) {
  const router = Router();
  router.use(auth);

  router.post("/read-all", (req, res) => {
    db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id);
    res.status(204).end();
  });

  router.patch("/:id/read", (req, res) => {
    const { changes } = db
      .prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?")
      .run(id(req.params.id, "La notificación"), req.user.id);
    if (!changes) throw notFound("Notificación no encontrada.");
    res.status(204).end();
  });

  return router;
}
