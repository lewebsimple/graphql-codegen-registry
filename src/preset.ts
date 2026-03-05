import { dirname, join } from "node:path";

import * as addPlugin from "@graphql-codegen/add";
import type { Types } from "@graphql-codegen/plugin-helpers";
import * as typedDocumentNodePlugin from "@graphql-codegen/typed-document-node";
import * as typescriptPlugin from "@graphql-codegen/typescript";
import * as typescriptOperationsPlugin from "@graphql-codegen/typescript-operations";
import type { GraphQLSchema } from "graphql";
import { Kind, isEnumType } from "graphql";

import * as registryPlugin from "./plugin";

type OperationType = "query" | "mutation" | "subscription";

type OperationArtifact = {
  name: string;
  operationType: OperationType;
};

const isGraphQLSchema = (value: unknown): value is GraphQLSchema => {
  return (
    typeof value === "object" &&
    value !== null &&
    "getTypeMap" in value &&
    typeof (value as GraphQLSchema).getTypeMap === "function"
  );
};

const getOperationAndFragmentArtifacts = (documents: Types.DocumentFile[]) => {
  const seenFragments = new Set<string>();
  const seenOperations = new Set<string>();
  const operations: OperationArtifact[] = [];
  const fragments: string[] = [];

  for (const documentFile of documents) {
    if (!documentFile.document) {
      continue;
    }

    for (const definition of documentFile.document.definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        const name = definition.name.value;
        if (seenFragments.has(name)) {
          throw new Error(`Duplicate fragment name detected: ${name}`);
        }

        seenFragments.add(name);
        fragments.push(name);
      }

      if (definition.kind === Kind.OPERATION_DEFINITION && definition.name) {
        const operationType = definition.operation;
        if (
          operationType !== "query" &&
          operationType !== "mutation" &&
          operationType !== "subscription"
        ) {
          continue;
        }

        const name = definition.name.value;
        const key = `${operationType}:${name}`;
        if (seenOperations.has(key)) {
          throw new Error(`Duplicate ${operationType} name detected: ${name}`);
        }

        seenOperations.add(key);
        operations.push({ name, operationType });
      }
    }
  }

  return { operations, fragments };
};

const getEnumNames = (schema: GraphQLSchema | null): string[] => {
  if (!schema) {
    return [];
  }

  return Object.values(schema.getTypeMap())
    .filter((type) => isEnumType(type) && !type.name.startsWith("__"))
    .map((type) => type.name)
    .sort((left, right) => left.localeCompare(right));
};

/**
 * Preset that emits three colocated artifacts:
 * - `types.ts` for operation/result TypeScript types
 * - `documents.ts` for typed document nodes
 * - split artifact modules under `operations/`, `fragments/`, and `enums/`
 * - `registry.ts` lazy loader index for generated modules
 * @returns GraphQL Codegen output preset implementation.
 */
export const preset: Types.OutputPreset = {
  /**
   * Builds all generate sections required by this preset.
   * @param options Codegen output options for the current generate target.
   * @returns Generate sections for operations, documents, and registry outputs.
   */
  buildGeneratesSection: async (options) => {
    const graphQLSchema = isGraphQLSchema(options.schemaAst)
      ? options.schemaAst
      : isGraphQLSchema(options.schema)
        ? options.schema
        : null;
    const { operations, fragments } = getOperationAndFragmentArtifacts(options.documents);
    const enumNames = getEnumNames(graphQLSchema);

    const baseConfig = {
      config: {
        ...options.config,
        useTypeImports: true,
      },
      documents: options.documents,
      schema: options.schema,
      schemaAst: options.schemaAst,
      pluginMap: {
        ...options.pluginMap,
        add: addPlugin,
        typescript: typescriptPlugin,
        "typescript-operations": typescriptOperationsPlugin,
        "typed-document-node": typedDocumentNodePlugin,
        "graphql-codegen-registry/plugin": registryPlugin,
      },
    };

    const outputDir = dirname(options.baseOutputDir);

    const sections: Types.GenerateOptions[] = [
      // generated/types.ts
      {
        ...baseConfig,
        filename: join(outputDir, "types.ts"),
        plugins: [
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
        ],
      },

      // generated/documents.ts
      {
        ...baseConfig,
        filename: join(outputDir, "documents.ts"),
        plugins: [
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
        ],
      },

      // generated/registry.ts
      {
        ...baseConfig,
        filename: options.baseOutputDir,
        plugins: [{ "graphql-codegen-registry/plugin": { mode: "registry" } }],
      },
    ];

    for (const operation of operations) {
      sections.push({
        ...baseConfig,
        filename: join(outputDir, "operations", `${operation.name}.ts`),
        plugins: [
          {
            "graphql-codegen-registry/plugin": {
              mode: "operation",
              name: operation.name,
              operationType: operation.operationType,
            },
          },
        ],
      });
    }

    for (const fragmentName of fragments) {
      sections.push({
        ...baseConfig,
        filename: join(outputDir, "fragments", `${fragmentName}.ts`),
        plugins: [
          {
            "graphql-codegen-registry/plugin": {
              mode: "fragment",
              name: fragmentName,
            },
          },
        ],
      });
    }

    for (const enumName of enumNames) {
      sections.push({
        ...baseConfig,
        filename: join(outputDir, "enums", `${enumName}.ts`),
        plugins: [
          {
            "graphql-codegen-registry/plugin": {
              mode: "enum",
              name: enumName,
            },
          },
        ],
      });
    }

    return sections;
  },
};

export default preset;
