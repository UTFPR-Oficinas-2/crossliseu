export type CurrentMatchSummary = {
    id: string;
    robotAName: string;
    robotBName: string;
};

// What the API shows of an arena: never the token hash
export class ArenaResponse {
    id: string;
    name: string;
    deviceId: string;
    /** Whether the arena device is connected (always false until the device link exists) */
    online: boolean;
    currentMatchId: string | null;
    currentMatch: CurrentMatchSummary | null;
}
