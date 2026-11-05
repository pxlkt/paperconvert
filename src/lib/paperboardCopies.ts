// The Paperboard note in the "Converted" dialog. One is picked per visit.
// Every line is about something the visitor just saw happen, then one fact
// about Paperboard. Same voice as paperboard.dev: plain, no superlatives.

export interface PaperboardCopy {
  tagline: string;
  text: string;
}

export const PAPERBOARD_COPIES: PaperboardCopy[] = [
  {
    tagline: "Your computer did that.",
    text: "No server touched the file. Paperboard works the same way for bigger things: game servers, Discord bots and local AI, run on your own machine.",
  },
  {
    tagline: "Zero bytes uploaded.",
    text: "The file stayed in this tab the whole time. Paperboard keeps your Minecraft worlds, bot tokens and chats on your disk in the same way.",
  },
  {
    tagline: "No queue, no daily limit.",
    text: "The only limit was your processor. Paperboard runs the programs you would otherwise rent a server for, on the computer you already have.",
  },
  {
    tagline: "Done without a round trip.",
    text: "Upload, wait, download: none of it happened. Paperboard is a desktop app where each self-hosted program is a panel you install and run locally.",
  },
  {
    tagline: "That ran on your processor.",
    text: "Paperboard puts it to work on more than files. Host a Minecraft server, build a Discord bot without code, or chat with a model offline.",
  },
  {
    tagline: "No account needed.",
    text: "Nothing here knows who you are, because nothing left your computer. Paperboard panels keep their data in a folder on your own machine.",
  },
];

export function getRandomCopy(): PaperboardCopy {
  return PAPERBOARD_COPIES[Math.floor(Math.random() * PAPERBOARD_COPIES.length)]!;
}
