import { Router } from 'express';
import { cancelBooking, createBooking, getBooking, listMyBookings } from '../controllers/bookingController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Every booking endpoint needs a logged-in user; ownership is checked in SQL.
router.use(requireAuth);
router.get('/', listMyBookings);
router.post('/', createBooking);
router.get('/:reference', getBooking);
router.post('/:reference/cancel', cancelBooking);

export default router;
