// All the commands
export type DiffieCommand =
    | { type: "review" }
    | { type: "explain"; targetText?: string }
    | { type: "help" }
    | { type: "unknown"; rawCommand: string }
    | null;


export function parseSlashCommand(commentBody: string): DiffieCommand {
    const trimmed = commentBody.trim();

    if (!/@diffie/i.test(trimmed) && !/diffie-bot/i.test(trimmed)) {
        return null;
    }

    const match = trimmed.match(/@diffie\s+([a-z-]+)(.*)/i);
    if (!match) {
        return { type: "help" };
    }

    const command = match[1].toLowerCase();
    const args = match[2]?.trim();

    switch(command) {
        case "review":
        case "re-review":
        case "rereview":
            return { type: "review" };
        case "explain":
            return {type: "explain", targetText: args};
        case "help":
            return {type: "help"};
        default:
            return {type: "unknown", rawCommand: command}
    }
}