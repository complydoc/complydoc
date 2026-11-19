import { mount } from "@/mount";
import { INDUSTRIES } from "@/pages/industries";
import { IndustryPage } from "@/pages/IndustryPage";

// Every industry page shares this script; its HTML says which industry it is.
const slug = document.documentElement.dataset.industry;
const industry = INDUSTRIES.find((item) => item.slug === slug);
if (!industry) throw new Error(`no industry called ${slug}`);
mount(<IndustryPage industry={industry} />);
