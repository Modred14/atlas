export const owner = {
  firstName: "Favour",
  lastName: "Omirin",
  nickName: "Modred",
  role: "Full-stack developer",
  stack: [
    "JavaScript",
    "TypeScript",
    "React",
    "Next.js",
    "Node.js",
    "Html",
    "Css",
    "Tailwind",
    "Html5",
    "PostgreSQL",
    "MongoDB",
    "Express",
    "Python",
    "Vue.Js",
  ],
};

export const ACCENT = "77,141,255"; // repo's signature blue (#4d8dff)

export const MOOD = {
  AM: { glow: "125,178,255" },
  PM_DAY: { glow: "251,191,36" },
  PM_NIGHT: { glow: "129,140,248" },
};

export function moodForClock(clockTime) {
  if (clockTime < "12:00:00") return "AM";
  if (clockTime < "18:00:00") return "PM_DAY";
  return "PM_NIGHT";
}