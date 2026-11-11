import { FightTimer } from './fight-timer.js';

describe('FightTimer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('fires once after the delay', () => {
        const timer = new FightTimer();
        const onFire = vi.fn();
        timer.arm('m', 1000, onFire);

        vi.advanceTimersByTime(999);
        expect(onFire).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onFire).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(5000);
        expect(onFire).toHaveBeenCalledTimes(1);
    });

    it('arm again replaces the earlier timer', () => {
        const timer = new FightTimer();
        const first = vi.fn();
        const second = vi.fn();
        timer.arm('m', 1000, first);
        timer.arm('m', 2000, second);

        vi.advanceTimersByTime(2000);

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('cancel stops it', () => {
        const timer = new FightTimer();
        const onFire = vi.fn();
        timer.arm('m', 1000, onFire);
        timer.cancel('m');

        vi.advanceTimersByTime(2000);

        expect(onFire).not.toHaveBeenCalled();
        expect(timer.armed('m')).toBe(false);
    });

    it('negative delay fires on the next tick', () => {
        const timer = new FightTimer();
        const onFire = vi.fn();
        timer.arm('m', -50, onFire);

        vi.advanceTimersByTime(0);

        expect(onFire).toHaveBeenCalledTimes(1);
    });

    it('armed is false after firing', () => {
        const timer = new FightTimer();
        timer.arm('m', 10, () => {});
        expect(timer.armed('m')).toBe(true);

        vi.advanceTimersByTime(10);

        expect(timer.armed('m')).toBe(false);
    });

    it('cancelAll stops every timer', () => {
        const timer = new FightTimer();
        const onFire = vi.fn();
        timer.arm('a', 10, onFire);
        timer.arm('b', 10, onFire);
        timer.cancelAll();

        vi.advanceTimersByTime(100);

        expect(onFire).not.toHaveBeenCalled();
    });
});
