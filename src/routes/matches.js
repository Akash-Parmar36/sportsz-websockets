import { Router } from 'express';
import { createMatchSchema, listMatchesQuerySchema } from '../validation/matches.js';
import { db } from '../db/db.js';
import { matches } from '../db/schema.js';
import { getMatchStatus } from '../utils/match-status.js';
import {desc} from "drizzle-orm";

export const matchRouter = Router();

const MAX_LIMIT = 100;

matchRouter.get('/', async (req, res) => {
    // console.log("Received query params = ", req.query);
    const parsed = listMatchesQuerySchema.safeParse(req.query);
    // console.log("Parsed = ", parsed);;

    if (!parsed.success) {
        return res.status(400).json({error: 'Invalid query.', details: parsed.error.issues });
    }
    
    const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);
    // console.log("Final limit = ", limit);

    try {
        const data = await db
                    .select()
                    .from(matches)
                    .orderBy((desc(matches.createdAt)))
                    .limit(limit)
        
        // console.log("Fetched matches = ", data);            
        res.json({ data });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to list matches.' });
    }
});

matchRouter.post('/', async (req, res) => {
    const parsed = createMatchSchema.safeParse(req.body);
    
    // console.log("parsed before passing zod Validation = ", parsed);

    if(!parsed.success) {
        return res.status(400).json({ error: 'Invalid payload.', details: parsed.error.issues });
    }

    const { data: { startTime, endTime, homeScore, awayScore } } = parsed;

    try {
        const [event] = await db.insert(matches).values({
            ...parsed.data,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            homeScore: homeScore ?? 0,
            awayScore: awayScore ?? 0,
            status: getMatchStatus(startTime, endTime),
        }).returning();
        
        console.log("Created match = ", event);

        const { broadcastMatchCreated } = res.app.locals;
        res.status(201).json({ data: event });
        if (broadcastMatchCreated) {
            setImmediate(() => {
                try {
                    broadcastMatchCreated(event);
                } catch (err) {
                    console.error('Failed to broadcast match creation:', err);
                }
            });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to create match.'});
    }
});
