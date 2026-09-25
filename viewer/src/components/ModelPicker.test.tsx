import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { pricedModels } from "@/report/pricing";
import { required, sampleAudit } from "@/test/sample";
import { ModelPicker } from "./ModelPicker";

const models = pricedModels(sampleAudit());
const first = required(models[0], "a priced model");

describe("ModelPicker", () => {
  it("names the chosen model on its button", () => {
    render(<ModelPicker label="Text model" models={models} value={first} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Text model" })).toHaveTextContent(first.name);
  });

  it("lists only models that take images when asked to", async () => {
    render(<ModelPicker label="Vision model" models={models} value={null} onChange={() => {}} visionOnly />);
    await userEvent.click(screen.getByRole("button", { name: "Vision model" }));
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(models.filter((m) => m.vision).length);
    const textOnly = required(models.find((m) => !m.vision), "a text-only model");
    // An option's name is the model's name followed by its price.
    expect(options.map((o) => o.textContent)).not.toContain(expect.stringMatching(new RegExp(`^${textOnly.name}\\$`)));
  });

  it("finds a model by what is typed and chooses it", async () => {
    const chosen = vi.fn();
    const target = required(models.find((m) => m.provider === "openai"), "an OpenAI model");
    render(<ModelPicker label="Text model" models={models} value={first} onChange={chosen} />);
    await userEvent.click(screen.getByRole("button", { name: "Text model" }));
    await userEvent.type(screen.getByPlaceholderText("Search models…"), target.name);
    const option = await screen.findByRole("option", { name: new RegExp(target.name) });
    expect(within(option).getByRole("img", { name: "OpenAI" })).toBeInTheDocument();
    await userEvent.click(option);
    expect(chosen).toHaveBeenCalledWith(target.id);
  });
});
