const ADJECTIVES = [
  "Sneaky", "Silent", "Swift", "Shady", "Quiet", "Clever", "Crafty", "Nimble", "Stealthy", "Bold",
  "Lucky", "Sly", "Hidden", "Ghostly", "Rapid", "Wily", "Cosmic", "Fuzzy", "Mellow", "Zippy",
];
const ANIMALS = [
  "Otter", "Fox", "Raccoon", "Owl", "Panther", "Gecko", "Badger", "Lynx", "Ferret", "Heron",
  "Moth", "Coyote", "Hare", "Falcon", "Mantis", "Puma", "Weasel", "Bat", "Viper", "Marten",
];

/** Friendly random player name ("Sneaky Otter") so nobody has to type before playing. */
export function randomName(rand: () => number = Math.random): string {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}
