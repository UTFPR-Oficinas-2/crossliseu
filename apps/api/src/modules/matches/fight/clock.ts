/** Injectable source of "now", so tests can fix the time */
export abstract class Clock {
    abstract now(): Date;
}

export class SystemClock extends Clock {
    now(): Date {
        return new Date();
    }
}
