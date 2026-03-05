import type { PluginFunction, Types } from "@graphql-codegen/plugin-helpers";
import type { GraphQLSchema } from "graphql";
import { Kind, isInterfaceType, isObjectType } from "graphql";

import {
  getDefinition,
  getDocumentExportIdentifier,
  getEnumTypes,
  getEnumValuesExpression,
  getNamedArtifacts,
  isOperationArtifact,
  type OperationType,
} from "./lib/artifacts";
import {
  buildSelectionSchema,
  getEnumSchemaIdentifier,
  getFragmentSchemaIdentifier,
  getRawInputTypeExpressionFromTypeNode,
} from "./lib/zod";

type RegistryPluginConfig = {
  mode?: "registry" | "operation" | "fragment" | "enum";
  name?: string;
  operationType?: OperationType;
};

export const plugin: PluginFunction<RegistryPluginConfig> = (schema, documents, config) => {
  switch (config.mode ?? "registry") {
    case "enum":
      if (!config.name) {
        throw new Error("Enum mode requires name.");
      }
      return getEnumModuleContent(schema, config.name);

    case "fragment":
      if (!config.name) {
        throw new Error("Fragment mode requires name.");
      }
      return getFragmentModuleContent(schema, documents, config.name);

    case "operation":
      if (!config.operationType || !config.name) {
        throw new Error("Operation mode requires both operationType and name.");
      }
      return getOperationModuleContent(schema, documents, config.operationType, config.name);

    case "registry":
      return getRegistryModuleContent(schema, documents);
  }
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
      return `import { schema as ${getFragmentSchemaIdentifier(fragmentName)} } from "./${fragmentName}";`;
    });
  const fragmentDocumentIdentifier = getDocumentExportIdentifier("fragment", name);

  return [
    'import { z } from "zod";',
    "",
    `import { ${fragmentDocumentIdentifier} } from "../documents";`,
    ...fragmentImportLines,
    ...enumImports,
    "",
    `export const document = ${fragmentDocumentIdentifier};`,
    `export const schema = ${schemaExpression};`,
    "",
  ].join("\n");
};

function getOperationModuleContent(
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  operationType: OperationType,
  name: string,
): string {
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
      return `import { schema as ${getFragmentSchemaIdentifier(fragmentName)} } from "../fragments/${fragmentName}";`;
    });
  const operationDocumentIdentifier = getDocumentExportIdentifier("operation", name);

  return [
    'import { z } from "zod";',
    "",
    `import { ${operationDocumentIdentifier} } from "../documents";`,
    ...fragmentImportLines,
    ...enumImports,
    "",
    `export const document = ${operationDocumentIdentifier};`,
    `export const kind = "${operationType}" as const;`,
    `export const schema = ${schemaExpression};`,
    `export const variablesSchema = ${variablesSchemaExpression};`,
    "",
  ].join("\n");
}

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
