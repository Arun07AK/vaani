import AvatarCell from "./_components/AvatarCell";
import GlossOverlay from "./_components/GlossOverlay";
import MicControl from "./_components/MicControl";
import TopRule from "./_components/TopRule";

export default function Home() {
  return (
    <main
      className="grid h-dvh w-full bg-[color:var(--vaani-bg)] text-[color:var(--vaani-text)]"
      style={{ gridTemplateRows: "48px 1fr 48px 64px" }}
    >
      <TopRule />
      <AvatarCell />
      <GlossOverlay />
      <MicControl />
    </main>
  );
}
