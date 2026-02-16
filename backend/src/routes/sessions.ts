import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all sessions
router.get('/', async (_req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { date: 'desc' }
    });
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get session by ID
router.get('/:id', async (req, res): Promise<void> => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id }
    });
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Get session results
router.get('/:id/results', async (req, res): Promise<void> => {
  try {
    const results = await prisma.result.findMany({
      where: { sessionId: req.params.id },
      include: {
        driver: true,
        team: true,
        vehicle: true
      }
    });

    // Get all laps for this session to calculate final positions
    const laps = await prisma.lap.findMany({
      where: { sessionId: req.params.id }
    });

    // Calculate final race positions based on cumulative time
    // Position = most laps completed, then lowest cumulative time
    const finalPositions = new Map<number, number>();
    
    if (laps.length > 0) {
      // Build cumulative times per startNumber
      const startNumbers = Array.from(new Set(laps.map(l => l.startNumber)));
      const carStats: { startNumber: number; lapsCompleted: number; cumTime: number }[] = [];
      
      for (const sn of startNumbers) {
        const snLaps = laps.filter(l => l.startNumber === sn).sort((a, b) => a.lapNumber - b.lapNumber);
        let cumTime = 0;
        for (const lap of snLaps) {
          cumTime += lap.lapTime;
        }
        carStats.push({ startNumber: sn, lapsCompleted: snLaps.length, cumTime });
      }
      
      // Sort: more laps first, then lower cumulative time
      carStats.sort((a, b) => {
        if (b.lapsCompleted !== a.lapsCompleted) return b.lapsCompleted - a.lapsCompleted;
        return a.cumTime - b.cumTime;
      });
      
      carStats.forEach((car, index) => {
        finalPositions.set(car.startNumber, index + 1);
      });
    }

    const pitStops = await prisma.pitStop.findMany({
      where: { sessionId: req.params.id },
      select: { startNumber: true }
    });
    const pitCounts = new Map<number, number>();
    for (const pit of pitStops) {
      pitCounts.set(pit.startNumber, (pitCounts.get(pit.startNumber) || 0) + 1);
    }

    // Merge calculated final positions with results
    const resultsWithFinalPosition = results.map(result => ({
      ...result,
      position: finalPositions.get(result.startNumber) || result.position,
      pitStopCount: pitCounts.get(result.startNumber) || 0
    }));

    // Sort by final position
    resultsWithFinalPosition.sort((a, b) => (a.position || 999) - (b.position || 999));

    res.json(resultsWithFinalPosition);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Get session laps
router.get('/:id/laps', async (req, res) => {
  try {
    const { startNumber, driverId } = req.query;
    
    const where: any = { sessionId: req.params.id };
    if (startNumber) where.startNumber = parseInt(startNumber as string);
    if (driverId) where.driverId = driverId;
    
    const laps = await prisma.lap.findMany({
      where,
      include: {
        driver: true,
        vehicle: true
      },
      orderBy: [
        { startNumber: 'asc' },
        { lapNumber: 'asc' }
      ]
    });

    const pitStops = await prisma.pitStop.findMany({
      where: { sessionId: req.params.id }
    });

    const pitMap = new Map<string, { inPit: boolean; duration: number | null }>();
    for (const pit of pitStops) {
      pitMap.set(`${pit.startNumber}-${pit.lapNumber}`, {
        inPit: true,
        duration: pit.duration ?? null
      });
    }

    const lapsWithPit = laps.map((lap) => {
      const pit = pitMap.get(`${lap.startNumber}-${lap.lapNumber}`);
      return {
        ...lap,
        inPit: pit?.inPit ?? false,
        pitDuration: pit?.duration ?? null
      };
    });

    res.json(lapsWithPit);
  } catch (error) {
    console.error('Error fetching laps:', error);
    res.status(500).json({ error: 'Failed to fetch laps' });
  }
});

// Get sector times
router.get('/:id/sectors', async (req, res) => {
  try {
    const { startNumber, driverId } = req.query;
    
    const where: any = { sessionId: req.params.id };
    if (startNumber) where.startNumber = parseInt(startNumber as string);
    if (driverId) where.driverId = driverId;
    
    const sectorTimes = await prisma.sectorTime.findMany({
      where,
      include: {
        driver: true,
        vehicle: true
      },
      orderBy: [
        { startNumber: 'asc' },
        { lapNumber: 'asc' }
      ]
    });
    res.json(sectorTimes);
  } catch (error) {
    console.error('Error fetching sector times:', error);
    res.status(500).json({ error: 'Failed to fetch sector times' });
  }
});

export default router;
