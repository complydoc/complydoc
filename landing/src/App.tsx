import { TooltipProvider } from "@/components/ui/tooltip";
import { Footer } from "@/sections/Footer";
import { GetStarted } from "@/sections/GetStarted";
import { Hero } from "@/sections/Hero";
import { Injection } from "@/sections/Injection";
import { Integrations } from "@/sections/Integrations";
import { Models } from "@/sections/Models";
import { Nav } from "@/sections/Nav";
import { PageRouter } from "@/sections/PageRouter";
import { Problem } from "@/sections/Problem";
import { Providers } from "@/sections/Providers";
import { Questions } from "@/sections/Questions";

export function App() {
  return (
    <TooltipProvider>
      <Nav />
      <main>
        <Hero />
        <Providers />
        <Problem />
        <Questions />
        <PageRouter />
        <Injection />
        <Integrations />
        <Models />
        <GetStarted />
      </main>
      <Footer />
    </TooltipProvider>
  );
}
