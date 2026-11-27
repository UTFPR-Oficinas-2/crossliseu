import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { Clock } from '../src/modules/matches/fight/clock.js';
import { RecordingStorage } from '../src/modules/recordings/recording-storage.js';
import {
    createTestApp,
    createUser,
    dataSourceOf,
    loginToken,
    resetDatabase,
    seedChampionship,
    seedMatch,
    seedRobot,
} from './helpers.js';

const T0 = new Date('2026-12-09T15:12:00Z');
const COMBINED = 'analyses/m/heatmap_combined.png';

class FakeClock extends Clock {
    current = T0;
    now(): Date {
        return this.current;
    }
    advance(ms: number) {
        this.current = new Date(this.current.getTime() + ms);
    }
}

/** Signs locally: the results routes only ever ask for read URLs */
class FakeStorage extends RecordingStorage {
    presignUpload(): Promise<string> {
        throw new Error('not used');
    }
    async presignDownload(key: string) {
        return `https://r2.test/${key}`;
    }
    async objectSize() {
        return null;
    }
    async deleteObject() {}
}

describe('results (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let clock: FakeClock;
    let token: string;
    let championshipId: string;
    let robots: { a: string; b: string };

    beforeAll(async () => {
        clock = new FakeClock();
        app = await createTestApp((builder) =>
            builder
                .overrideProvider(Clock)
                .useValue(clock)
                .overrideProvider(RecordingStorage)
                .useValue(new FakeStorage()),
        );
        ds = dataSourceOf(app);
    });

    beforeEach(async () => {
        clock.current = T0;
        await resetDatabase(ds);
        await createUser(ds, 'admin', 'pw');
        token = await loginToken(app, 'admin', 'pw');
        const championship = await seedChampionship(ds);
        championshipId = championship.id;
        const a = await seedRobot(ds, championshipId, { name: 'Aço' });
        const b = await seedRobot(ds, championshipId, { name: 'Faísca' });
        robots = { a: a.id, b: b.id };
    });

    afterAll(async () => {
        await app.close();
    });

    const http = () => request(app.getHttpServer());
    const command = (id: string, name: string) =>
        http()
            .post(`/matches/${id}/${name}`)
            .set({ Authorization: `Bearer ${token}` })
            .expect(200);

    const newMatch = async () =>
        (await seedMatch(ds, championshipId, robots.a, robots.b)).id;

    /** Started, fought for `ms`, finished; not closed */
    const fight = async (id: string, ms = 60_000) => {
        await command(id, 'start');
        clock.advance(ms);
        await command(id, 'finish');
    };

    const scorePoints = async (id: string, robotId: string, points: number) => {
        for (let i = 0; i < points; i++) {
            await ds.query(
                `INSERT INTO "match_events" ("match_id", "type", "occurred_at", "robot_id", "judge_seat", "action")
                 VALUES ($1, 'scored', $2, $3, $4, 1)`,
                [id, clock.now(), robotId, (i % 3) + 1],
            );
        }
    };

    const video = async (
        id: string,
        status: string,
        result: Record<string, unknown> | null = null,
    ) => {
        await ds.query(
            `INSERT INTO "match_videos" ("match_id", "object_key", "content_type", "status",
                "uploaded_at", "uploaded_by_user_id", "analysis_status", "analysis_result")
             SELECT "id", 'recordings/' || "id" || '/a.mp4', 'video/mp4', 'uploaded', now(),
                "created_by_user_id", $2, $3
             FROM "matches" WHERE "id" = $1`,
            [id, status, result === null ? null : JSON.stringify(result)],
        );
    };

    describe('GET /championships/:id/results', () => {
        it('lists only closed fights, newest first, without login', async () => {
            const first = await newMatch();
            const second = await newMatch();
            const unconfirmed = await newMatch();
            await newMatch(); // scheduled

            await fight(first);
            await command(first, 'close');
            clock.advance(60_000);
            await fight(second);
            await command(second, 'close');
            await fight(unconfirmed);

            const res = await http()
                .get(`/championships/${championshipId}/results`)
                .expect(200);

            expect(res.body.map((r: { matchId: string }) => r.matchId)).toEqual(
                [second, first],
            );
            expect(res.body[0]).toEqual({
                matchId: second,
                championshipId,
                weightClass: 'lightweight',
                closedAt: expect.any(String),
                robots: {
                    A: { id: robots.a, name: 'Aço' },
                    B: { id: robots.b, name: 'Faísca' },
                },
                winnerSide: null,
                draw: true,
                endReason: 'manual',
                surrenderedSide: null,
            });
        });

        it('answers 404 for an unknown championship', async () => {
            const res = await http()
                .get(
                    '/championships/00000000-0000-4000-8000-000000000000/results',
                )
                .expect(404);

            expect(res.body.message).toBe('championship_not_found');
        });
    });

    describe('GET /matches/:id/result', () => {
        it('returns a closed fight with every field, without login', async () => {
            const id = await newMatch();
            await command(id, 'start');
            clock.advance(30_000);
            await command(id, 'pause');
            clock.advance(60_000);
            await command(id, 'resume');
            clock.advance(30_000);
            await command(id, 'finish');
            await scorePoints(id, robots.a, 11);
            await scorePoints(id, robots.b, 5);
            await video(id, 'done', {
                mock: false,
                totalFrames: 3990,
                combinedHeatmapKey: COMBINED,
                robots: {
                    A: {
                        detectedPositions: 1284,
                        heatmapKey: 'analyses/m/r1.png',
                    },
                    B: {
                        detectedPositions: 1131,
                        heatmapKey: 'analyses/m/r2.png',
                    },
                },
            });
            await command(id, 'close');

            const res = await http().get(`/matches/${id}/result`).expect(200);

            expect(res.body).toEqual({
                matchId: id,
                championshipId,
                weightClass: 'lightweight',
                startedAt: T0.toISOString(),
                closedAt: expect.any(String),
                durationMs: 60_000,
                robots: {
                    A: { id: robots.a, name: 'Aço' },
                    B: { id: robots.b, name: 'Faísca' },
                },
                winnerSide: 'A',
                draw: false,
                endReason: 'manual',
                surrenderedSide: null,
                score: { A: 11, B: 5 },
                analysis: {
                    status: 'done',
                    heatmapUrl: `https://r2.test/${COMBINED}`,
                    expiresAt: expect.any(String),
                    totalFrames: 3990,
                    detectedPositions: { A: 1284, B: 1131 },
                },
            });
        });

        it('gives the status and no heatmap link while processing', async () => {
            const id = await newMatch();
            await fight(id);
            await video(id, 'running');
            await command(id, 'close');

            const res = await http().get(`/matches/${id}/result`).expect(200);

            expect(res.body.analysis).toEqual({
                status: 'running',
                heatmapUrl: null,
                expiresAt: null,
                totalFrames: null,
                detectedPositions: { A: null, B: null },
            });
        });

        it('has no analysis status when no video was sent', async () => {
            const id = await newMatch();
            await fight(id);
            await command(id, 'close');

            const res = await http().get(`/matches/${id}/result`).expect(200);

            expect(res.body.analysis.status).toBeNull();
        });

        it('hides a finished fight that is not closed', async () => {
            const id = await newMatch();
            await fight(id);

            const res = await http().get(`/matches/${id}/result`).expect(404);

            expect(res.body.message).toBe('result_not_found');
        });

        it('answers the same 404 for an unknown match', async () => {
            const res = await http()
                .get('/matches/00000000-0000-4000-8000-000000000000/result')
                .expect(404);

            expect(res.body.message).toBe('result_not_found');
        });
    });
});
