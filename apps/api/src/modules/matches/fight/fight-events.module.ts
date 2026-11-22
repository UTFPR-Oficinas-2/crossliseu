import { Module } from '@nestjs/common';
import { FightEvents } from './fight-events.js';

/** Its own module, so modules that MatchesModule imports (championships) can emit too */
@Module({
    providers: [FightEvents],
    exports: [FightEvents],
})
export class FightEventsModule {}
