import Intake from "@/components/Intake";

export const metadata = {
  title: "Make a gift · Lantern",
  description: "Describe a place you remember. It becomes somewhere they can walk.",
};

export default function MakePage() {
  return (
    <main className="h-dvh w-full bg-[#05060a]">
      <Intake />
    </main>
  );
}
