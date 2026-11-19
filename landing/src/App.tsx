import { TooltipProvider } from "@/components/ui/tooltip";
import { Demos } from "@/sections/Demos";
import { Footer } from "@/sections/Footer";
import { Gateway } from "@/sections/Gateway";
import { GetStarted } from "@/sections/GetStarted";
import { Hero } from "@/sections/Hero";
import { HowItWorks } from "@/sections/HowItWorks";
import { Integrations } from "@/sections/Integrations";
import { Measured } from "@/sections/Measured";
import { Nav } from "@/sections/Nav";

export function App() {
  return (
    <TooltipProvider>
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Gateway />
        <Measured />
        <Demos />
        <Integrations />
        <GetStarted />
      </main>
      <Footer />
    </TooltipProvider>
  );
}
