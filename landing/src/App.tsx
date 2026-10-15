import { TooltipProvider } from "@/components/ui/tooltip";
import { Faq } from "@/sections/Faq";
import { Features } from "@/sections/Features";
import { Footer } from "@/sections/Footer";
import { GetStarted } from "@/sections/GetStarted";
import { Hero } from "@/sections/Hero";
import { Integrations } from "@/sections/Integrations";
import { Nav } from "@/sections/Nav";
import { Numbers } from "@/sections/Numbers";
import { Quickstart } from "@/sections/Quickstart";
import { Team } from "@/sections/Team";
import { Trust } from "@/sections/Trust";

export function App() {
  return (
    <TooltipProvider>
      <Nav />
      <main>
        <Hero />
        <Trust />
        <Quickstart />
        <Features />
        <Numbers />
        <Team />
        <Integrations />
        <Faq />
        <GetStarted />
      </main>
      <Footer />
    </TooltipProvider>
  );
}
