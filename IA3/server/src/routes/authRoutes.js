import { Router } from 'express';
import { changePassword, login, logout, me, register, updateProfile } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', me);
router.put('/me', requireAuth, updateProfile);
router.put('/me/password', requireAuth, changePassword);

export default router;
