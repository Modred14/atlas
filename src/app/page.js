"use client";

import Image from "next/image";
import { useState } from "react";

export const owner = {
  firstName: "Favour",
  lastName: "Omirin",
  nickName: "Modred",
  
};

export default function Home() {
  const [clock, setClock] = useState(new Date().toLocaleTimeString());

  setInterval(() => {
    const clockTime = new Date().toLocaleTimeString();
    setClock(clockTime);
  }, 1000);

  return (
    <div className="">
      <div></div>
      <div className="text-4xl sm:text-6xl font-bold flex justify-center mt-10">
        {clock}
      </div>
    </div>
  );
}
