import type { Types } from "@graphql-codegen/plugin-helpers";
import { pascalCase } from "es-toolkit/string";
import type {
  FragmentDefinitionNode,
  GraphQLEnumType,
  GraphQLSchema,
  OperationDefinitionNode,
} from "graphql";
import { Kind, isEnumType } from "graphql";

export type OperationType = "query" | "mutation" | "subscription";
export type ArtifactKind = OperationType | "fragment";

export type ArtifactDescriptor = {
  name: string;
  kind: ArtifactKind;
};

export const isOperationArtifact = (
  artifact: ArtifactDescriptor,
): artifact is ArtifactDescriptor & { kind: OperationType } => {
  return (
    artifact.kind === "query" || artifact.kind === "mutation" || artifact.kind === "subscription"
  );
};

export const getNamedArtifacts = (documents: Types.DocumentFile[]): ArtifactDescriptor[] => {
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

export const getDefinition = (
  documents: Types.DocumentFile[],
  kind: ArtifactKind,
  name: string,
): OperationDefinitionNode | FragmentDefinitionNode | null => {
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

export const getEnumTypes = (schema: GraphQLSchema): GraphQLEnumType[] => {
  return Object.values(schema.getTypeMap())
    .filter((type): type is GraphQLEnumType => isEnumType(type) && !type.name.startsWith("__"))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const getDocumentExportIdentifier = (
  artifactType: "operation" | "fragment",
  artifactName: string,
): string => {
  const suffix = artifactType === "operation" ? "Document" : "FragmentDoc";
  return `${artifactName
    .split("_")
    .map((segment) => pascalCase(segment))
    .join("_")}${suffix}`;
};

export const getEnumValuesExpression = (enumType: GraphQLEnumType): string => {
  const values = enumType
    .getValues()
    .map((value) => `'${value.value}'`)
    .join(", ");

  if (values.length === 0) {
    return "z.never()";
  }

  return `z.enum([${values}])`;
};
