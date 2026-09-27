import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes what a spreadsheet would split, and leaves the rest", () => {
    expect(toCsv(["name", "value"], [["IBAN", "•••• 54 32"], ['Acme, "Ltd"', null]])).toBe(
      'name,value\r\nIBAN,•••• 54 32\r\n"Acme, ""Ltd""",\r\n',
    );
  });

  it("keeps a value that starts like a formula as text", () => {
    expect(toCsv(["v"], [["=HYPERLINK(1)"], ["-5"]])).toBe("v\r\n'=HYPERLINK(1)\r\n'-5\r\n");
  });
});
