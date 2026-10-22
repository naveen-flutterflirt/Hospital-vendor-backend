import { Router } from 'express';
import { NotificationsController } from '../controllers/notifications.controller.js';
import { optionalAuthenticate, authenticate } from '../middleware/auth.middleware.js';
const router = Router();
// Retrieve notifications list & unread count (supports authenticated or broadcast mode)
router.get('/', optionalAuthenticate, NotificationsController.getNotifications);
router.get('/unread-count', optionalAuthenticate, NotificationsController.getUnreadCount);
// Mark as read endpoints
router.patch('/mark-all-read', optionalAuthenticate, NotificationsController.markAllRead);
router.patch('/:id/read', optionalAuthenticate, NotificationsController.markAsRead);
// Create new notification (internal/admin service)
router.post('/', authenticate, NotificationsController.createNotification);
export default router;
