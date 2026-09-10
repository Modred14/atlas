"use client";

import Image from "next/image";
import { useState } from "react";

export const owner = {
  firstName: "Favour",
  lastName: "Omirin",
  nickName: "Modred",
};

export default function Home() {
  const [clock, setClock] = useState("00:00:00");
  const [greeting, setGreeting] = useState("Good Morning");
  const [timeOfDay, setTimeOfDay] = useState("AM");
  const date = new Date();

  async function updateStats() {
    const [current, stats] = await Promise.all([
      fetch("https://track-vs.netlify.app/api/coding/current").then((r) =>
        r.json(),
      ),
      fetch("https://track-vs.netlify.app/api/coding/stats").then((r) =>
        r.json(),
      ),
    ]);

    const mins = Math.floor(current.todaySeconds / 60);
    document.getElementById("today-total").textContent = `${mins}m coded today`;
    document.getElementById("streak").textContent =
      `${stats.streakDays} day streak`;
  }

  updateStats();
  setInterval(updateStats, 60000); // refresh every minute

  setInterval(() => {
    const clockTime = new Date().toLocaleTimeString();
    if (clockTime < "12:00:00") {
      setGreeting("Good Morning");
      setTimeOfDay("AM");
    } else if (clockTime < "18:00:00") {
      setGreeting("Good Afternoon");
      setTimeOfDay("PM");
    } else {
      setGreeting("Good Evening");
      setTimeOfDay("PM");
    }
    setClock(clockTime);
  }, 1000);
  const [hr, mins, secs] = clock.split(":");

  return (
    <div className="p-3">
      <div></div>
      <div className="border border-px border-gray-400/40 rounded-xl p-5">
        <div classNmame="mb-3">
          {greeting}, <span className="font-bold">{owner.nickName}</span>
        </div>
        <div className="inline-flex items-start gap-2">
          <div className="text-5xl sm:text-6xl font-bold">
            {hr} : {mins}
          </div>{" "}
          <div className="grid font-bold pt-2">
            <span className="text-[10px] sm:text-[14px] leading-tight text-gray-500">
              {timeOfDay}
            </span>
            <span className="text-base sm:text-xl">{secs}</span>
          </div>
        </div>
        <div>
          {date.toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </div>
        <div className="flex mt-4 gap-2">
          <div className="border border-gray-400/40 py-2 px-3">
            <span id="today-total">–</span>
          </div>
          <div className="border border-gray-400/40 py-2 px-3">
            <span id="streak">–</span>
          </div>
          <div className="border border-gray-400/40 py-2 px-3"></div>
        </div>
      </div>
    </div>
  );
}
