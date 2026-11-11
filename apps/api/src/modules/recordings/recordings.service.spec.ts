import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ChampionshipsService } from '../championships/championships.service.js';
import type { Match } from '../matches/entities/match.entity.js';
import type { MatchesService } from '../matches/matches.service.js';
import { MatchVideo } from './entities/match-video.entity.js';
import type { MatchVideosRepository } from './match-videos.repository.js';
import { RecordingStorage } from './recording-storage.js';
import {
    READ_URL_TTL_SECONDS,
    RecordingsService,
    UPLOAD_URL_TTL_SECONDS,
    recordingKey,
} from './recordings.service.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const KEY = `recordings/${MATCH_ID}.mp4`;

/** R2 stand-in: remembers what was signed and which objects "exist" */
class FakeStorage extends RecordingStorage {
    signed: { key: string; contentType: string; expiresIn: number }[] = [];
    readSigned: { key: string; expiresIn: number }[] = [];
    objects = new Map<string, number>();

    async presignUpload(key: string, contentType: string, expiresIn: number) {
        this.signed.push({ key, contentType, expiresIn });
        return `https://r2.example/${key}?signature=fake`;
    }

    async presignDownload(key: string, expiresIn: number) {
        this.readSigned.push({ key, expiresIn });
        return `https://r2.example/${key}?read-signature=fake`;
    }

    async objectSize(key: string) {
        return this.objects.get(key) ?? null;
    }
}

interface Options {
    missingMatch?: boolean;
    owner?: boolean;
    existing?: MatchVideo | null;
}

function setup({
    missingMatch = false,
    owner = true,
    existing = null,
}: Options = {}) {
    const storage = new FakeStorage();
    let stored: MatchVideo | null = existing;

    const matchesService = {
        findOne: vi.fn(async (id: string) => {
            if (missingMatch) throw new NotFoundException('match_not_found');
            return { id, championshipId: CHAMPIONSHIP_ID } as Match;
        }),
    };
    const championshipsService = {
        isOwnedBy: vi.fn(async () => owner),
    };
    const videos = {
        findByMatch: vi.fn(async () => stored),
        save: vi.fn(async (video: MatchVideo) => {
            stored = video;
            return video;
        }),
    };

    const service = new RecordingsService(
        matchesService as unknown as MatchesService,
        championshipsService as unknown as ChampionshipsService,
        videos as unknown as MatchVideosRepository,
        storage,
    );
    return { service, storage, videos, current: () => stored };
}

function uploadingVideo(): MatchVideo {
    const video = new MatchVideo();
    video.matchId = MATCH_ID;
    video.objectKey = KEY;
    video.contentType = 'video/mp4';
    video.status = 'uploading';
    video.sizeBytes = null;
    video.uploadedAt = null;
    video.uploadedByUserId = USER_ID;
    return video;
}

describe('recordingKey', () => {
    it('names the object after the match, with the extension of the type', () => {
        expect(recordingKey(MATCH_ID, 'video/mp4')).toBe(KEY);
        expect(recordingKey(MATCH_ID, 'video/webm')).toBe(
            `recordings/${MATCH_ID}.webm`,
        );
    });
});

describe('RecordingsService.requestUploadUrl', () => {
    it('signs one PUT of the match key and stores the video as uploading', async () => {
        const { service, storage, current } = setup();
        const before = Date.now();

        const answer = await service.requestUploadUrl(
            MATCH_ID,
            'video/mp4',
            USER_ID,
        );

        expect(storage.signed).toEqual([
            {
                key: KEY,
                contentType: 'video/mp4',
                expiresIn: UPLOAD_URL_TTL_SECONDS,
            },
        ]);
        expect(answer.key).toBe(KEY);
        expect(answer.url).toContain(KEY);
        const expiresAt = new Date(answer.expiresAt).getTime();
        expect(expiresAt).toBeGreaterThanOrEqual(
            before + UPLOAD_URL_TTL_SECONDS * 1000,
        );

        expect(current()).toMatchObject({
            matchId: MATCH_ID,
            objectKey: KEY,
            contentType: 'video/mp4',
            status: 'uploading',
            sizeBytes: null,
            uploadedByUserId: USER_ID,
        });
    });

    it('reuses the row when the match is recorded again', async () => {
        const previous = uploadingVideo();
        previous.status = 'uploaded';
        previous.sizeBytes = 123;
        const { service, current } = setup({ existing: previous });

        await service.requestUploadUrl(MATCH_ID, 'video/webm', USER_ID);

        expect(current()).toBe(previous);
        expect(current()).toMatchObject({
            objectKey: `recordings/${MATCH_ID}.webm`,
            status: 'uploading',
            sizeBytes: null,
        });
    });

    it('answers 404 for a match in someone else championship, without signing', async () => {
        const { service, storage, videos } = setup({ owner: false });

        await expect(
            service.requestUploadUrl(MATCH_ID, 'video/mp4', USER_ID),
        ).rejects.toEqual(new NotFoundException('match_not_found'));
        expect(storage.signed).toEqual([]);
        expect(videos.save).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown match', async () => {
        const { service } = setup({ missingMatch: true });

        await expect(
            service.requestUploadUrl(MATCH_ID, 'video/mp4', USER_ID),
        ).rejects.toEqual(new NotFoundException('match_not_found'));
    });
});

describe('RecordingsService.complete', () => {
    it('stores the video as uploaded with the size read from R2', async () => {
        const { service, storage, current } = setup({
            existing: uploadingVideo(),
        });
        storage.objects.set(KEY, 73_400_320);

        await service.complete(
            MATCH_ID,
            { key: KEY, size: 73_400_320 },
            USER_ID,
        );

        expect(current()).toMatchObject({
            status: 'uploaded',
            sizeBytes: 73_400_320,
        });
        expect(current()?.uploadedAt).toBeInstanceOf(Date);
    });

    it('refuses a key that was not handed out', async () => {
        const { service, videos } = setup({ existing: uploadingVideo() });

        await expect(
            service.complete(
                MATCH_ID,
                { key: 'recordings/other.mp4', size: 1 },
                USER_ID,
            ),
        ).rejects.toEqual(new ConflictException('recording_not_requested'));
        expect(videos.save).not.toHaveBeenCalled();
    });

    it('refuses when no upload URL was ever asked for', async () => {
        const { service } = setup();

        await expect(
            service.complete(MATCH_ID, { key: KEY, size: 1 }, USER_ID),
        ).rejects.toEqual(new ConflictException('recording_not_requested'));
    });

    it('refuses while the object is not in R2', async () => {
        const { service, current } = setup({ existing: uploadingVideo() });

        await expect(
            service.complete(MATCH_ID, { key: KEY, size: 10 }, USER_ID),
        ).rejects.toEqual(new ConflictException('recording_not_uploaded'));
        expect(current()?.status).toBe('uploading');
    });

    it('refuses an incomplete upload (size differs from R2)', async () => {
        const { service, storage, current } = setup({
            existing: uploadingVideo(),
        });
        storage.objects.set(KEY, 500);

        await expect(
            service.complete(MATCH_ID, { key: KEY, size: 1000 }, USER_ID),
        ).rejects.toEqual(new ConflictException('recording_size_mismatch'));
        expect(current()?.status).toBe('uploading');
    });

    it('answers 404 for a match in someone else championship', async () => {
        const { service } = setup({ owner: false, existing: uploadingVideo() });

        await expect(
            service.complete(MATCH_ID, { key: KEY, size: 1 }, USER_ID),
        ).rejects.toEqual(new NotFoundException('match_not_found'));
    });
});

describe('RecordingsService.getRecording', () => {
    function uploadedVideo(): MatchVideo {
        const video = uploadingVideo();
        video.status = 'uploaded';
        video.sizeBytes = 73_400_320;
        video.uploadedAt = new Date('2026-11-10T22:15:37Z');
        return video;
    }

    it('returns the video with a fresh read URL', async () => {
        const { service, storage } = setup({ existing: uploadedVideo() });
        const before = Date.now();

        const answer = await service.getRecording(MATCH_ID, USER_ID);

        expect(storage.readSigned).toEqual([
            { key: KEY, expiresIn: READ_URL_TTL_SECONDS },
        ]);
        expect(answer).toMatchObject({
            key: KEY,
            contentType: 'video/mp4',
            sizeBytes: 73_400_320,
            uploadedAt: new Date('2026-11-10T22:15:37Z'),
            url: `https://r2.example/${KEY}?read-signature=fake`,
        });
        expect(new Date(answer.expiresAt).getTime()).toBeGreaterThanOrEqual(
            before + READ_URL_TTL_SECONDS * 1000,
        );
    });

    it('answers 404 recording_not_found when nothing was uploaded', async () => {
        const { service, storage } = setup();

        await expect(service.getRecording(MATCH_ID, USER_ID)).rejects.toEqual(
            new NotFoundException('recording_not_found'),
        );
        expect(storage.readSigned).toEqual([]);
    });

    it('answers 404 recording_not_found while an upload is still in progress', async () => {
        const { service } = setup({ existing: uploadingVideo() });

        await expect(service.getRecording(MATCH_ID, USER_ID)).rejects.toEqual(
            new NotFoundException('recording_not_found'),
        );
    });

    it('answers 404 match_not_found for a match in someone else championship', async () => {
        const { service, storage } = setup({
            owner: false,
            existing: uploadedVideo(),
        });

        await expect(service.getRecording(MATCH_ID, USER_ID)).rejects.toEqual(
            new NotFoundException('match_not_found'),
        );
        expect(storage.readSigned).toEqual([]);
    });
});
