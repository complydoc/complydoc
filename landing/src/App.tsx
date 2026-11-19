import { TooltipProvider } from "@/components/ui/tooltip";
import { Demos } from "@/sections/Demos";
import { Footer } from "@/sections/Footer";
import { GetStarted } from "@/sections/GetStarted";
import { Hero } from "@/sections/Hero";
import { Industries } from "@/sections/Industries";
import { Integrations } from "@/sections/Integrations";
import { Nav } from "@/sections/Nav";

export function App() {
  return (
    <TooltipProvider>
      <Nav />
      <main>
        <Hero />
        <Demos />
        <Industries />
        <Integrations />
        <GetStarted />
      </main>
      <Footer />
    </TooltipProvider>
  );
}
