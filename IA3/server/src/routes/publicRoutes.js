import { Router } from 'express';
import {
  getHomeData, getMeta, getSchedule, getSeatMap, listCities, listStations, searchServices,
} from '../controllers/catalogController.js';

const router = Router();

router.get('/cities', listCities);
router.get('/stations', listStations);
router.get('/services/search', searchServices);
router.get('/schedules/:id', getSchedule);
router.get('/schedules/:id/seats', getSeatMap);
router.get('/home', getHomeData);
router.get('/meta', getMeta);

export default router;
