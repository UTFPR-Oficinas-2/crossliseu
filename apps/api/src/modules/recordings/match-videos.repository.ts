import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchVideo } from './entities/match-video.entity.js';

@Injectable()
export class MatchVideosRepository {
    constructor(
        @InjectRepository(MatchVideo)
        private readonly repository: Repository<MatchVideo>,
    ) {}

    findByMatch(matchId: string): Promise<MatchVideo | null> {
        return this.repository.findOne({ where: { matchId } });
    }

    save(video: MatchVideo): Promise<MatchVideo> {
        return this.repository.save(video);
    }
}
