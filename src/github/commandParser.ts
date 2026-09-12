// All the commands
export type DiffieCommand =
  | { type: "review" }
  | { type: "explain"; targetText?: string }
  | { type: "help" }
  | { type: "unknown"; rawCommand: string }
  | null;