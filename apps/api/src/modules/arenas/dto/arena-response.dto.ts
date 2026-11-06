// What the API shows of an arena: never the device id or the token hash
export class ArenaResponse {
    id: string;
    name: string;
    /** Whether the arena device is connected (always false until the device link exists) */
    online: boolean;
    currentMatchId: string | null;
}
