import type { Types } from "@graphql-codegen/plugin-helpers";
import type { CodegenPlugin } from "@graphql-codegen/plugin-helpers";
import { camelCase } from "es-toolkit/string";
import type { GraphQLEnumType, GraphQLSchema } from "graphql";
import { Kind, isEnumType, isInterfaceType, isObjectType } from "graphql";

import { buildSelectionSchema, getRawInputTypeExpressionFromTypeNode } from "./lib/zod";

// ────────────────────────────────────────────────────────────────────────────────
// Artifact types and utilities
// ────────────────────────────────────────────────────────────────────────────────

type OperationType = "query" | "mutation" | "subscription";
type ArtifactKind = OperationType | "fragment";

type ArtifactDescriptor = {
  name: string;
  kind: ArtifactKind;
};

type RegistryPluginConfig = {
  mode?: "registry" | "operation" | "fragment" | "enum";
  name?: string;
  operationType?: OperationType;
};

const isOperationArtifact = (
  artifact: ArtifactDescriptor,
): artifact is ArtifactDescriptor & { kind: OperationType } => {
  return (
    artifact.kind === "query" || artifact.kind === "mutation" || artifact.kind === "subscription"
  );
};

const getNamedArtifacts = (documents: Types.DocumentFile[]): ArtifactDescriptor[] => {
  const seen = new Set<string>();
  const artifacts: ArtifactDescriptor[] = [];

  for (const documentFile of documents) {
    if (!documentFile.document) {
      continue;
    }

    for (const definition of documentFile.document.definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        const name = definition.name.value;
        const key = `fragment:${name}`;

        if (seen.has(key)) {
          throw new Error(`Duplicate fragment name detected: ${name}`);
        }

        seen.add(key);
        artifacts.push({ name, kind: "fragment" });
      }

      if (definition.kind === Kind.OPERATION_DEFINITION && definition.name) {
        const name = definition.name.value;
        const operation = definition.operation;

        if (operation !== "query" && operation !== "mutation" && operation !== "subscription") {
          continue;
        }

        const key = `${operation}:${name}`;

        if (seen.has(key)) {
          throw new Error(`Duplicate ${operation} name detected: ${name}`);
        }

        seen.add(key);
        artifacts.push({ name, kind: operation });
      }
    }
  }

  return artifacts;
};

const getDefinition = (documents: Types.DocumentFile[], kind: ArtifactKind, name: string) => {
  for (const documentFile of documents) {
    if (!documentFile.document) {
      continue;
    }

    for (const definition of documentFile.document.definitions) {
      if (
        kind === "fragment" &&
        definition.kind === Kind.FRAGMENT_DEFINITION &&
        definition.name.value === name
      ) {
        return definition;
      }

      if (
        (kind === "query" || kind === "mutation" || kind === "subscription") &&
        definition.kind === Kind.OPERATION_DEFINITION &&
        definition.operation === kind &&
        definition.name?.value === name
      ) {
        return definition;
      }
    }
  }

  return null;
};

const getEnumTypes = (schema: GraphQLSchema): GraphQLEnumType[] => {
  return Object.values(schema.getTypeMap())
    .filter((type): type is GraphQLEnumType => isEnumType(type) && !type.name.startsWith("__"))
    .sort((left, right) => left.name.localeCompare(right.name));
};

const getEnumSchemaIdentifier = (enumName: string): string => {
  return `${camelCase(enumName)}EnumSchema`;
};

const getEnumValuesExpression = (enumType: GraphQLEnumType): string => {
  const values = enumType
    .getValues()
    .map((value) => `'${value.value}'`)
    .join(", ");

  if (values.length === 0) {
    return "z.never()";
  }

  return `z.enum([${values}])`;
};

const getEnumImportsForContent = (
  schema: GraphQLSchema,
  fromPath: string,
  content: string,
): string[] => {
  return getEnumTypes(schema)
    .filter((enumType) => content.includes(getEnumSchemaIdentifier(enumType.name)))
    .map((enumType) => {
      return `import { schema as ${getEnumSchemaIdentifier(enumType.name)} } from "${fromPath}/${enumType.name}";`;
    });
};

const getRegistryModuleContent = (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
): string => {
  const artifacts = getNamedArtifacts(documents);
  const operationArtifacts = artifacts.filter(isOperationArtifact);
  const fragmentArtifacts = artifacts.filter((artifact) => artifact.kind === "fragment");
  const enumTypes = getEnumTypes(schema);

  const operationLines = operationArtifacts.map((operation) => {
    return [
      `    ${operation.name}: {`,
      `      load: () => import("./operations/${operation.name}"),`,
      "    },",
    ].join("\n");
  });

  const fragmentLines = fragmentArtifacts.map((fragment) => {
    return [
      `    ${fragment.name}: {`,
      `      load: () => import("./fragments/${fragment.name}"),`,
      "    },",
    ].join("\n");
  });

  const enumLines = enumTypes.map((enumType) => {
    return [
      `    ${enumType.name}: {`,
      `      load: () => import("./enums/${enumType.name}"),`,
      "    },",
    ].join("\n");
  });

  const operationEntriesBlock = operationLines.join("\n\n");
  const fragmentEntriesBlock = fragmentLines.join("\n\n");
  const enumEntriesBlock = enumLines.join("\n\n");

  return [
    'import type { z } from "zod";',
    "",
    "export const registry = {",
    "  operations: {",
    operationEntriesBlock,
    "  },",
    "",
    "  fragments: {",
    fragmentEntriesBlock,
    "  },",
    "",
    "  enums: {",
    enumEntriesBlock,
    "  },",
    "} as const;",
    "",
    "export type OperationName = keyof typeof registry.operations;",
    'type OperationNameByKind<TKind extends "query" | "mutation" | "subscription"> = {',
    '  [TName in OperationName]: LoadedOperation<TName>["kind"] extends TKind ? TName : never;',
    "}[OperationName];",
    "",
    'export type QueryName = OperationNameByKind<"query">;',
    'export type MutationName = OperationNameByKind<"mutation">;',
    'export type SubscriptionName = OperationNameByKind<"subscription">;',
    "",
    "export type FragmentName = keyof typeof registry.fragments;",
    "export type EnumName = keyof typeof registry.enums;",
    "",
    "type LoadedOperation<T extends OperationName> =",
    '  Awaited<ReturnType<(typeof registry.operations)[T]["load"]>>;',
    "type LoadedFragment<T extends FragmentName> =",
    '  Awaited<ReturnType<(typeof registry.fragments)[T]["load"]>>;',
    "type LoadedEnum<T extends EnumName> =",
    '  Awaited<ReturnType<(typeof registry.enums)[T]["load"]>>;',
    "",
    `export type VariablesOf<T extends OperationName> = z.input<LoadedOperation<T>["variablesSchema"]>;`,
    `export type ResultOf<T extends OperationName> = z.infer<LoadedOperation<T>["schema"]>;`,
    `export type FragmentOf<T extends FragmentName> = z.infer<LoadedFragment<T>["schema"]>;`,
    `export type EnumOf<T extends EnumName> = z.infer<LoadedEnum<T>["schema"]>;`,
    "",
    `export const loadOperation = <T extends OperationName>(name: T) => registry.operations[name].load();`,
    `export const loadFragment = <T extends FragmentName>(name: T) => registry.fragments[name].load();`,
    `export const loadEnum = <T extends EnumName>(name: T) => registry.enums[name].load();`,
  ].join("\n");
};

const getOperationModuleContent = (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  operationType: OperationType,
  name: string,
): string => {
  const definition = getDefinition(documents, operationType, name);

  if (
    !definition ||
    definition.kind !== Kind.OPERATION_DEFINITION ||
    definition.operation !== operationType
  ) {
    throw new Error(`Could not find named ${operationType} definition for ${name}`);
  }

  const operationRootType =
    operationType === "query"
      ? schema.getQueryType()
      : operationType === "mutation"
        ? schema.getMutationType()
        : schema.getSubscriptionType();

  if (!operationRootType) {
    throw new Error(`${operationType} root type is required to generate operation module ${name}.`);
  }

  const { schemaExpression, fragmentDependencies } = buildSelectionSchema(
    schema,
    definition.selectionSet,
    operationRootType,
  );

  const variableLines: string[] = [];

  for (const variableDefinition of definition.variableDefinitions ?? []) {
    const variableName = variableDefinition.variable.name.value;
    const rawExpression = getRawInputTypeExpressionFromTypeNode(
      schema,
      variableDefinition.type,
      variableDefinition.defaultValue ?? undefined,
    );

    variableLines.push(`  ${variableName}: ${rawExpression},`);
  }

  const variablesSchemaExpression = `z.object({\n${variableLines.join("\n")}\n})`;
  const enumImports = getEnumImportsForContent(
    schema,
    "../enums",
    `${schemaExpression}\n${variablesSchemaExpression}`,
  );

  const fragmentImportLines = [...fragmentDependencies]
    .sort((left, right) => left.localeCompare(right))
    .map((fragmentName) => {
      return `import { schema as ${camelCase(fragmentName)}FragmentSchema } from "../fragments/${fragmentName}";`;
    });

  return [
    'import { z } from "zod";',
    "",
    `import { ${name}Document } from "../documents";`,
    ...fragmentImportLines,
    ...enumImports,
    "",
    `export const document = ${name}Document;`,
    `export const kind = "${operationType}" as const;`,
    `export const schema = ${schemaExpression};`,
    `export const variablesSchema = ${variablesSchemaExpression};`,
    "",
  ].join("\n");
};

const getFragmentModuleContent = (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  name: string,
): string => {
  const definition = getDefinition(documents, "fragment", name);

  if (!definition || definition.kind !== Kind.FRAGMENT_DEFINITION) {
    throw new Error(`Could not find named fragment definition for ${name}`);
  }

  const typeName = definition.typeCondition.name.value;
  const type = schema.getType(typeName);

  if (!type || (!isObjectType(type) && !isInterfaceType(type))) {
    throw new Error(`Fragment ${name} references unsupported type: ${typeName}`);
  }

  const { schemaExpression, fragmentDependencies } = buildSelectionSchema(
    schema,
    definition.selectionSet,
    type,
  );
  const enumImports = getEnumImportsForContent(schema, "../enums", schemaExpression);

  const fragmentImportLines = [...fragmentDependencies]
    .filter((dependencyName) => dependencyName !== name)
    .sort((left, right) => left.localeCompare(right))
    .map((fragmentName) => {
      return `import { schema as ${camelCase(fragmentName)}FragmentSchema } from "./${fragmentName}";`;
    });

  return [
    'import { z } from "zod";',
    "",
    `import { ${name}FragmentDoc } from "../documents";`,
    ...fragmentImportLines,
    ...enumImports,
    "",
    `export const document = ${name}FragmentDoc;`,
    `export const schema = ${schemaExpression};`,
    "",
  ].join("\n");
};

const getEnumModuleContent = (schema: GraphQLSchema, name: string): string => {
  const enumType = getEnumTypes(schema).find((candidate) => candidate.name === name);

  if (!enumType) {
    throw new Error(`Could not find named enum type for ${name}`);
  }

  return [
    'import { z } from "zod";',
    "",
    `export const schema = ${getEnumValuesExpression(enumType)};`,
    "",
  ].join("\n");
};

export const registryPlugin: CodegenPlugin<RegistryPluginConfig> = {
  plugin: (schema, documents, config) => {
    const mode = config.mode ?? "registry";

    if (mode === "operation") {
      if (!config.operationType || !config.name) {
        throw new Error("Operation mode requires both operationType and name.");
      }

      return getOperationModuleContent(schema, documents, config.operationType, config.name);
    }

    if (mode === "fragment") {
      if (!config.name) {
        throw new Error("Fragment mode requires name.");
      }

      return getFragmentModuleContent(schema, documents, config.name);
    }

    if (mode === "enum") {
      if (!config.name) {
        throw new Error("Enum mode requires name.");
      }

      return getEnumModuleContent(schema, config.name);
    }

    return getRegistryModuleContent(schema, documents);
  },
};
