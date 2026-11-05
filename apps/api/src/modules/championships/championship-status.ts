export type ChampionshipStatus = 'ongoing' | 'scheduled' | 'closed';

const utcDay = (date: Date): string => date.toISOString().split('T')[0];

/** Compares UTC calendar days, so a championship is ongoing on both its start and end day */
export function championshipStatus(
    startDate: Date,
    endDate: Date,
    now: Date = new Date(),
): ChampionshipStatus {
    const today = utcDay(now);

    if (utcDay(endDate) < today) {
        return 'closed';
    }
    if (utcDay(startDate) > today) {
        return 'scheduled';
    }
    return 'ongoing';
}
