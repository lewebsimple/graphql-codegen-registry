import { codegen } from "@graphql-codegen/core";
import * as typedDocumentNodePlugin from "@graphql-codegen/typed-document-node";
import * as typescriptPlugin from "@graphql-codegen/typescript";
import * as typescriptOperationsPlugin from "@graphql-codegen/typescript-operations";
import { parse, buildSchema } from "graphql";
import { describe, expect, it } from "vitest";

import plugin from "../src/plugin/index";
import preset from "../src/preset/index";

describe("preset", () => {
  it("generates types from a real schema and document", async () => {
    const sdl = /* GraphQL */ `
      type Query {
        user(id: ID!): User
      }

      type User {
        id: ID!
        name: String!
      }
    `;
    const schema = parse(sdl);
    const schemaAst = buildSchema(sdl);

    const documents = [
      {
        document: parse(/* GraphQL */ `
          query GetUser($id: ID!) {
            user(id: $id) {
              id
              name
            }
          }
        `),
      },
    ];

    const [section] = await preset.buildGeneratesSection({
      baseOutputDir: "generated.ts",
      pluginMap: {
        typescript: typescriptPlugin,
        "typescript-operations": typescriptOperationsPlugin,
        "typed-document-node": typedDocumentNodePlugin,
        "graphql-codegen-registry/plugin": plugin,
      },
      config: {},
      documents,
      schema,
      schemaAst,
    } as any);

    const output = await codegen({
      filename: section.filename,
      schema,
      documents,
      config: section.config,
      plugins: section.plugins,
      pluginMap: section.pluginMap,
    });

    console.log(output);

    expect(output).toContain("export type GetUserQueryVariables");
    expect(output).toContain("export type GetUserQuery");
    expect(output).toContain("export const GetUserDocument");
  });
});
