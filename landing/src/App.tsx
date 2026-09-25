import { TooltipProvider } from "@/components/ui/tooltip";
import { Checks } from "@/sections/Checks";
import { Finding } from "@/sections/Finding";
import { Footer } from "@/sections/Footer";
import { Gate } from "@/sections/Gate";
import { GetStarted } from "@/sections/GetStarted";
import { Hero } from "@/sections/Hero";
import { Loaders } from "@/sections/Loaders";
import { Nav } from "@/sections/Nav";
import { Offline } from "@/sections/Offline";
import { Routing } from "@/sections/Routing";

export function App() {
  return (
    <TooltipProvider>
      <Nav />
      <main>
        <Hero />
        <Checks />
        <Finding />
        <Loaders />
        <Routing />
        <Gate />
        <Offline />
        <GetStarted />
      </main>
      <Footer />
    </TooltipProvider>
  );
}
