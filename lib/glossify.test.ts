import { describe, expect, it } from "vitest";
import { glossify } from "./glossify";

const text = (tokens: ReturnType<typeof glossify>) => tokens.map((t) => t.text);
const nmms = (tokens: ReturnType<typeof glossify>) =>
  tokens.map((t) => t.nmm ?? null);

describe("glossify — 10 ISL sentence patterns", () => {
  it("pattern 1: SVO → SOV", () => {
    expect(text(glossify("I eat rice"))).toEqual(["I", "RICE", "EAT"]);
  });

  it("pattern 2: copula + adjective drops 'am'", () => {
    expect(text(glossify("I am happy"))).toEqual(["I", "HAPPY"]);
  });

  it("pattern 3: copula + noun drops 'is a'", () => {
    expect(text(glossify("She is a friend"))).toEqual(["SHE", "FRIEND"]);
  });

  it("pattern 4: time adverbial fronts", () => {
    expect(text(glossify("I will go home tomorrow"))).toEqual([
      "TOMORROW",
      "I",
      "HOME",
      "GO",
    ]);
  });

  it("pattern 5: verbal negation moves NOT to end with neg NMM", () => {
    const out = glossify("I don't know you");
    expect(text(out)).toEqual(["I", "YOU", "KNOW", "NOT"]);
    expect(out[out.length - 1].nmm).toBe("neg");
  });

  it("pattern 6: copular negation → ADJ/NOUN + NOT with neg NMM", () => {
    const out = glossify("He is not a doctor");
    expect(text(out)).toEqual(["HE", "DOCTOR", "NOT"]);
    expect(out[out.length - 1].nmm).toBe("neg");
  });

  it("pattern 7: WH-identification → NP + WH with wh NMM", () => {
    const out = glossify("What is your name?");
    expect(text(out)).toEqual(["YOUR", "NAME", "WHAT"]);
    expect(out[out.length - 1].nmm).toBe("wh");
  });

  it("pattern 8: WH on verb → SUBJ OBJ VERB WH with wh NMM", () => {
    const out = glossify("Where do you live?");
    expect(text(out)).toEqual(["YOU", "LIVE", "WHERE"]);
    expect(out[out.length - 1].nmm).toBe("wh");
  });

  it("pattern 9: want/need → SUBJ OBJ WANT", () => {
    expect(text(glossify("I want water"))).toEqual(["I", "WATER", "WANT"]);
    expect(text(glossify("She needs help"))).toEqual(["SHE", "HELP", "NEED"]);
  });

  it("pattern 10: possession/plural → SUBJ NOUN NUM HAVE", () => {
    expect(text(glossify("I have two friends"))).toEqual([
      "I",
      "FRIEND",
      "TWO",
      "HAVE",
    ]);
  });

  it("verbs are lemmatized to root form", () => {
    expect(text(glossify("She is eating rice"))).toEqual(["SHE", "RICE", "EAT"]);
  });

  it("no NMMs are added when not needed", () => {
    expect(nmms(glossify("I eat rice"))).toEqual([null, null, null]);
  });
});
