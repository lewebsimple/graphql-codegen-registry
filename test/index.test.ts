import { describe, expect, it } from "vitest";

import preset from "../src/index";

import { documents } from "./fixtures/documents";
import { schema, schemaAst } from "./fixtures/schema";

describe("preset", () => {
  it("builds split artifact modules next to the provided registry output file", async () => {
    const options: Parameters<NonNullable<typeof preset.buildGeneratesSection>>[0] = {
      baseOutputDir: "generated/registry.ts",
      presetConfig: {},
      plugins: [],
      pluginMap: {},
      config: {},
      documents,
      schema,
      schemaAst,
    };

    const result = await preset.buildGeneratesSection(options);

    expect(result).toHaveLength(7);

    const typesSection = result.find((section) => section.filename === "generated/types.ts");
    expect(typesSection?.plugins).toEqual([
      {
        typescript: {
          avoidOptionals: {
            defaultValue: false,
            field: true,
            inputValue: false,
            object: true,
          },
          constEnums: true,
          defaultScalarType: "unknown",
          inputMaybeValue: "T | null | undefined",
          strictScalars: true,
        },
      },
      {
        "typescript-operations": {
          avoidOptionals: {
            defaultValue: false,
            field: true,
            inputValue: false,
            object: true,
          },
          preResolveTypes: true,
        },
      },
    ]);

    const documentsSection = result.find(
      (section) => section.filename === "generated/documents.ts",
    );
    expect(documentsSection?.plugins).toEqual([
      {
        add: {
          content: 'import type * as Types from "./types";',
        },
      },
      {
        "typed-document-node": {
          importOperationTypesFrom: "./types",
        },
      },
    ]);

    const getUserOperationSection = result.find(
      (section) => section.filename === "generated/operations/GetUser.ts",
    );
    expect(getUserOperationSection?.plugins).toEqual([
      {
        "graphql-codegen-registry": {
          mode: "operation",
          name: "GetUser",
          operationType: "query",
        },
      },
    ]);

    const updateUserOperationSection = result.find(
      (section) => section.filename === "generated/operations/UpdateUser.ts",
    );
    expect(updateUserOperationSection?.plugins).toEqual([
      {
        "graphql-codegen-registry": {
          mode: "operation",
          name: "UpdateUser",
          operationType: "mutation",
        },
      },
    ]);

    const userUpdatedOperationSection = result.find(
      (section) => section.filename === "generated/operations/UserUpdated.ts",
    );
    expect(userUpdatedOperationSection?.plugins).toEqual([
      {
        "graphql-codegen-registry": {
          mode: "operation",
          name: "UserUpdated",
          operationType: "subscription",
        },
      },
    ]);

    const viewerFragmentSection = result.find(
      (section) => section.filename === "generated/fragments/Viewer.ts",
    );
    expect(viewerFragmentSection?.plugins).toEqual([
      {
        "graphql-codegen-registry": {
          mode: "fragment",
          name: "Viewer",
        },
      },
    ]);

    const registrySection = result.find((section) => section.filename === "generated/registry.ts");
    expect(registrySection?.plugins).toEqual([
      {
        "graphql-codegen-registry": {
          mode: "registry",
        },
      },
    ]);
  });
});
