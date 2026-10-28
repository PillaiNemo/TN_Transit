import { Router } from 'express';
import { registerCatalogAdmin } from '../controllers/admin/catalogAdmin.js';
import { registerInsightsAdmin } from '../controllers/admin/insightsAdmin.js';
import { registerOperationsAdmin } from '../controllers/admin/operationsAdmin.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// Role check on the server for EVERY admin endpoint.
router.use(requireAdmin);
registerInsightsAdmin(router);
registerCatalogAdmin(router);
registerOperationsAdmin(router);

export default router;
