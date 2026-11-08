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
    /** Whether the arena box is logged in on /arena right now */
    online: boolean;
    currentMatchId: string | null;
    currentMatch: CurrentMatchSummary | null;
}
