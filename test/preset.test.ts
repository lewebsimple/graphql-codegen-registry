import { describe, it, expect } from "vitest";

import preset from "../src/preset/index";

describe("preset", () => {
  it("builds one generates section with expected plugins", async () => {
    const [section] = await preset.buildGeneratesSection({
      baseOutputDir: "out.ts",
      pluginMap: {},
      config: {},
      documents: [],
      schema: undefined,
      schemaAst: undefined,
    } as any);

    expect(section.filename).toBe("out.ts");
    expect(section.plugins).toEqual([
      { typescript: {} },
      { "typescript-operations": {} },
      { "graphql-codegen-registry/plugin": {} },
    ]);
  });
});
