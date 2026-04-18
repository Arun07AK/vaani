import type { GlossToken, NMM } from "./stores/pipeline";

export type { GlossToken } from "./stores/pipeline";

const AUX_STOPWORDS = new Set([
  "a", "an", "the",
  "is", "am", "are", "was", "were", "be", "been", "being",
  "do", "does", "did",
  "will", "shall",
  "to", "of",
]);

const TIME_WORDS: Record<string, string> = {
  yesterday: "YESTERDAY",
  today: "TODAY",
  tomorrow: "TOMORROW",
  now: "NOW",
  morning: "MORNING",
  evening: "EVENING",
  night: "NIGHT",
};

const WH_WORDS: Record<string, string> = {
  what: "WHAT",
  who: "WHO",
  where: "WHERE",
  when: "WHEN",
  why: "WHY",
  how: "HOW",
  which: "WHICH",
};

const PRONOUN: Record<string, string> = {
  i: "I", me: "I",
  my: "MY", mine: "MY",
  you: "YOU",
  your: "YOUR", yours: "YOUR",
  he: "HE", him: "HE",
  his: "HIS",
  she: "SHE", her: "HER",
  we: "WE", us: "WE",
  our: "OUR", ours: "OUR",
  they: "THEY", them: "THEY",
  their: "THEIR", theirs: "THEIR",
};

const SUBJECT_PRONOUNS = new Set(["i", "me", "you", "he", "him", "she", "her", "we", "us", "they", "them"]);

const VERB_LEMMA: Record<string, string> = {
  eat: "EAT", eats: "EAT", eating: "EAT", ate: "EAT", eaten: "EAT",
  drink: "DRINK", drinks: "DRINK", drinking: "DRINK", drank: "DRINK", drunk: "DRINK",
  go: "GO", goes: "GO", going: "GO", went: "GO", gone: "GO",
  come: "COME", comes: "COME", coming: "COME", came: "COME",
  see: "SEE", sees: "SEE", seeing: "SEE", saw: "SEE", seen: "SEE",
  want: "WANT", wants: "WANT", wanting: "WANT", wanted: "WANT",
  need: "NEED", needs: "NEED", needing: "NEED", needed: "NEED",
  have: "HAVE", has: "HAVE", having: "HAVE", had: "HAVE",
  know: "KNOW", knows: "KNOW", knowing: "KNOW", knew: "KNOW", known: "KNOW",
  help: "HELP", helps: "HELP", helping: "HELP", helped: "HELP",
  live: "LIVE", lives: "LIVE", living: "LIVE", lived: "LIVE",
  read: "READ", reads: "READ", reading: "READ",
  write: "WRITE", writes: "WRITE", writing: "WRITE", wrote: "WRITE", written: "WRITE",
  sign: "SIGN", signs: "SIGN", signing: "SIGN", signed: "SIGN",
  sleep: "SLEEP", sleeps: "SLEEP", sleeping: "SLEEP", slept: "SLEEP",
  learn: "LEARN", learns: "LEARN", learning: "LEARN", learned: "LEARN",
  speak: "SPEAK", speaks: "SPEAK", speaking: "SPEAK", spoke: "SPEAK", spoken: "SPEAK",
};

const WANT_NEED = new Set(["want", "wants", "wanting", "wanted", "need", "needs", "needing", "needed"]);
const HAVE_LEMMAS = new Set(["have", "has", "had", "having"]);
const COPULA = new Set(["is", "am", "are", "was", "were"]);

const NUMBER_WORD: Record<string, string> = {
  one: "ONE", two: "TWO", three: "THREE",
  four: "FOUR", five: "FIVE", six: "SIX",
  seven: "SEVEN", eight: "EIGHT", nine: "NINE", ten: "TEN",
};

const ADJECTIVES = new Set([
  "happy", "sad", "good", "bad", "hungry", "thirsty", "tired",
  "big", "small", "old", "young", "new", "fast", "slow",
  "hot", "cold", "strong", "weak", "beautiful", "ugly",
  "angry", "afraid", "quiet", "loud",
]);

const NEG_SET = new Set(["not", "no"]);

function normalize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[?.!,;:]/g, "")
    .replace(/won't/g, "will not")
    .replace(/can't/g, "cannot")
    .replace(/n't/g, " not")
    .replace(/'ll/g, " will")
    .replace(/'re/g, " are")
    .replace(/'m/g, " am")
    .replace(/'ve/g, " have")
    .replace(/'d/g, " would")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes") || word.endsWith("ches") || word.endsWith("shes"))
    return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

type Role =
  | "wh"
  | "time"
  | "neg"
  | "pronoun"
  | "verb"
  | "number"
  | "adjective"
  | "aux"
  | "noun";

function classify(word: string): Role {
  if (WH_WORDS[word]) return "wh";
  if (TIME_WORDS[word]) return "time";
  if (NEG_SET.has(word)) return "neg";
  if (PRONOUN[word]) return "pronoun";
  if (VERB_LEMMA[word]) return "verb";
  if (NUMBER_WORD[word]) return "number";
  if (ADJECTIVES.has(word)) return "adjective";
  if (AUX_STOPWORDS.has(word)) return "aux";
  return "noun";
}

function uppercase(word: string, role: Role): string {
  if (role === "wh") return WH_WORDS[word];
  if (role === "time") return TIME_WORDS[word];
  if (role === "pronoun") return PRONOUN[word];
  if (role === "verb") return VERB_LEMMA[word];
  if (role === "number") return NUMBER_WORD[word];
  if (role === "noun") return singularize(word).toUpperCase();
  return word.toUpperCase();
}

type LabeledTok = {
  word: string;
  gloss: string;
  role: Role;
  isSubject?: boolean;
  isMainVerb?: boolean;
};

function label(words: string[]): LabeledTok[] {
  return words.map((word) => {
    const role = classify(word);
    return { word, gloss: uppercase(word, role), role };
  });
}

function tok(text: string, nmm?: NMM): GlossToken {
  return nmm ? { text, nmm } : { text };
}

export function glossify(input: string): GlossToken[] {
  const words = normalize(input);
  if (words.length === 0) return [];

  const labeled = label(words);
  const firstWord = labeled[0]?.word;

  // Assign roles (earlier wins)
  const subj = labeled.find((t) => t.role === "pronoun" && SUBJECT_PRONOUNS.has(t.word));
  if (subj) subj.isSubject = true;

  const verb = labeled.find((t) => t.role === "verb");
  if (verb) verb.isMainVerb = true;

  const wh = labeled.find((t) => t.role === "wh");
  const time = labeled.find((t) => t.role === "time");
  const num = labeled.find((t) => t.role === "number");
  const adj = labeled.find((t) => t.role === "adjective");
  const neg = labeled.find((t) => t.role === "neg");

  const hasWH = !!wh;
  const hasNeg = !!neg;
  const hasTime = !!time;
  const hasWantNeed = labeled.some((t) => WANT_NEED.has(t.word));
  const hasNumber = !!num;

  // Objects = every content token that is not subject, main verb, aux, neg, number, wh, time.
  // Includes non-subject pronouns (e.g., "you" in "I don't know you") AND verb-tagged words
  // that weren't selected as main verb (e.g., "help" in "She needs help").
  function objectsFor(output: GlossToken[]): GlossToken[] {
    return labeled
      .filter((t) => {
        if (t.isSubject) return false;
        if (t.isMainVerb) return false;
        if (t === wh || t === time || t === num) return false;
        if (t.role === "aux" || t.role === "neg") return false;
        if (t.role === "adjective") return false;
        return true;
      })
      .map((t) => tok(t.gloss));
  }
  // Unused helper above retained for clarity; inline below.

  function objects(): GlossToken[] {
    return labeled
      .filter((t) => {
        if (t.isSubject) return false;
        if (t.isMainVerb) return false;
        if (t === wh || t === time || t === num) return false;
        if (t.role === "aux" || t.role === "neg") return false;
        if (t.role === "adjective") return false;
        return true;
      })
      .map((t) => {
        if (t.role === "verb") return tok(t.word.toUpperCase() in VERB_LEMMA ? VERB_LEMMA[t.word]! : t.gloss);
        return tok(t.gloss);
      });
  }

  const subjTok = subj ? tok(subj.gloss) : null;

  // PATTERN 7: WH-identification — first word is WH, clause uses copula, no main verb
  if (hasWH && firstWord && WH_WORDS[firstWord]) {
    const hasCopula = labeled.some((t) => COPULA.has(t.word));
    const hasMainActionVerb =
      !!verb && !WANT_NEED.has(verb.word) && !HAVE_LEMMAS.has(verb.word);
    if (hasCopula && !hasMainActionVerb) {
      // Rest = everything except the WH, auxes, and negation
      const rest = labeled
        .slice(1)
        .filter((t) => t.role !== "aux" && t.role !== "neg")
        .map((t) => tok(t.gloss));
      return [...rest, tok(wh!.gloss, "wh")];
    }
  }

  // PATTERN 8: WH on verb — first word is WH, clause has a content verb
  if (hasWH && firstWord && WH_WORDS[firstWord] && verb) {
    const out: GlossToken[] = [];
    if (subjTok) out.push(subjTok);
    out.push(...objects());
    out.push(tok(verb.gloss));
    out.push(tok(wh!.gloss, "wh"));
    return out;
  }

  // PATTERN 5: verbal negation (non-copular) — "SUBJ don't VERB OBJ"
  if (hasNeg && verb && !hasWH) {
    const negIdx = labeled.findIndex((t) => t.role === "neg");
    const prev = labeled[negIdx - 1];
    const isCopularNeg = prev && COPULA.has(prev.word);
    if (!isCopularNeg) {
      const out: GlossToken[] = [];
      if (subjTok) out.push(subjTok);
      out.push(...objects());
      out.push(tok(verb.gloss));
      out.push(tok("NOT", "neg"));
      return out;
    }
  }

  // PATTERN 6: copular negation — "SUBJ is not ADJ/NOUN"
  if (hasNeg && !verb && !hasWH) {
    const out: GlossToken[] = [];
    if (subjTok) out.push(subjTok);
    if (adj) out.push(tok(adj.gloss));
    else out.push(...objects());
    out.push(tok("NOT", "neg"));
    return out;
  }

  // PATTERN 4: time-fronting — "SUBJ VERB OBJ TIME"
  if (hasTime && verb && !hasWH && !hasNeg) {
    const out: GlossToken[] = [tok(time!.gloss)];
    if (subjTok) out.push(subjTok);
    out.push(...objects());
    out.push(tok(verb.gloss));
    return out;
  }

  // PATTERN 10: possession/plural — "SUBJ have NUM NOUN(s)"
  if (verb && HAVE_LEMMAS.has(verb.word) && hasNumber) {
    const out: GlossToken[] = [];
    if (subjTok) out.push(subjTok);
    out.push(...objects());
    out.push(tok(num!.gloss));
    out.push(tok(verb.gloss));
    return out;
  }

  // PATTERN 9: want/need — "SUBJ want/need OBJ"
  if (hasWantNeed && verb) {
    const out: GlossToken[] = [];
    if (subjTok) out.push(subjTok);
    out.push(...objects());
    out.push(tok(verb.gloss));
    return out;
  }

  // PATTERN 1: plain SVO → SOV
  if (verb && !adj) {
    const out: GlossToken[] = [];
    if (subjTok) out.push(subjTok);
    out.push(...objects());
    out.push(tok(verb.gloss));
    return out;
  }

  // PATTERN 2: copula + adjective
  if (adj && !verb) {
    const out: GlossToken[] = [];
    if (subjTok) out.push(subjTok);
    out.push(tok(adj.gloss));
    return out;
  }

  // PATTERN 3: copula + noun — fallback when no verb, no adj
  if (!verb && !adj) {
    const out: GlossToken[] = [];
    if (subjTok) out.push(subjTok);
    out.push(...objects());
    return out;
  }

  // Fallback: content words in order, drop auxes
  return labeled.filter((t) => t.role !== "aux").map((t) => tok(t.gloss));
}
