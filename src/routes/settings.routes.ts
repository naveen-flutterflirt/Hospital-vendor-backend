import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// Apply auth middleware to all settings endpoints
router.use(authenticate);

// Tab 1: Profile
router.get('/profile', SettingsController.getProfile);
router.put('/profile', SettingsController.updateProfile);

// Tab 2: Roles & Security
router.put('/security/password', SettingsController.changePassword);
router.post('/security/2fa/toggle', SettingsController.toggle2FA);
router.get('/security/sessions', SettingsController.getSessions);
router.delete('/security/sessions/:id', SettingsController.revokeSession);

// Tab 3: Approval Workflows
router.get('/workflows', SettingsController.getWorkflows);
router.put('/workflows', SettingsController.updateWorkflows);

// Tab 4: Notifications
router.get('/notifications', SettingsController.getNotifications);
router.put('/notifications', SettingsController.updateNotifications);

// Tab 5: Integrations & Webhooks
router.get('/integrations', SettingsController.getIntegrations);
router.put('/integrations', SettingsController.updateIntegrations);
router.post('/integrations/test', SettingsController.testIntegration);

// Tab 6: Hospital Configuration
router.get('/config', SettingsController.getConfig);
router.put('/config', SettingsController.updateConfig);

export default router;
