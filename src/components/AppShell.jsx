export default function AppSHell({ children }) {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0b0b0e] text-white">
      {children}
    </div>
  );
}   