import type {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLUnionType,
  SelectionSetNode,
  TypeNode,
  ValueNode,
} from "graphql";
import {
  Kind,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
  valueFromASTUntyped,
} from "graphql";

/**
 * Maps a GraphQL scalar name to a Zod schema expression string.
 * @param scalarName GraphQL scalar type name.
 * @returns TypeScript source expression for the corresponding Zod schema.
 */
const scalarToZod = (scalarName: string): string => {
  if (scalarName === "Int" || scalarName === "Float") {
    return "z.number()";
  }

  if (scalarName === "String" || scalarName === "ID") {
    return "z.string()";
  }

  if (scalarName === "Boolean") {
    return "z.boolean()";
  }

  return "z.unknown()";
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

export const getEnumSchemaIdentifier = (enumName: string): string => {
  return getSchemaIdentifier(enumName, "EnumSchema");
};

export const getFragmentSchemaIdentifier = (fragmentName: string): string => {
  return getSchemaIdentifier(fragmentName, "FragmentSchema");
};

const getSchemaIdentifier = (name: string, suffix: "EnumSchema" | "FragmentSchema"): string => {
  return `gql${name}${suffix}`;
};

/**
 * Generates exported enum schema declarations from the GraphQL schema.
 * @param schema Executable GraphQL schema.
 * @returns Array of source chunks, one per enum type.
 */
export const getEnumSchemaDefinitions = (schema: GraphQLSchema): string[] => {
  const enumTypes = Object.values(schema.getTypeMap()).filter(
    (type): type is GraphQLEnumType => isEnumType(type) && !type.name.startsWith("__"),
  );

  return enumTypes.map((enumType) => {
    const schemaConstName = getEnumSchemaIdentifier(enumType.name);
    const enumValuesExpression = getEnumValuesExpression(enumType);

    return [
      `/** ${enumType.name} enum */`,
      `export const ${schemaConstName} = ${enumValuesExpression};`,
      `export type ${enumType.name}EnumInput = z.input<typeof ${schemaConstName}>;`,
      `export type ${enumType.name}EnumOutput = z.output<typeof ${schemaConstName}>;`,
      "",
    ].join("\n");
  });
};

/**
 * Converts a named GraphQL input-capable type into a Zod schema expression.
 * @param namedType GraphQL scalar, enum, or input object type.
 * @returns TypeScript source expression for the type.
 */
const getNamedTypeExpression = (
  namedType: GraphQLScalarType | GraphQLEnumType | GraphQLInputObjectType,
): string => {
  if (isScalarType(namedType)) {
    return scalarToZod(namedType.name);
  }

  if (isEnumType(namedType)) {
    return getEnumSchemaIdentifier(namedType.name);
  }

  const fields = namedType.getFields();
  const entries = Object.values(fields).map((field) => {
    const fieldExpression = getInputTypeExpression(field.type, field.defaultValue);
    return `  ${field.name}: ${fieldExpression},`;
  });
  const objectBody = entries.length > 0 ? `\n${entries.join("\n")}\n` : "";

  return `z.object({${objectBody}})`;
};

/**
 * Converts any non-null GraphQL input type to a Zod expression.
 * @param type GraphQL input type.
 * @returns TypeScript source expression for the non-null input schema.
 */
const getNonNullableInputTypeExpression = (type: GraphQLInputType): string => {
  if (isNonNullType(type)) {
    return getNonNullableInputTypeExpression(type.ofType);
  }

  if (isListType(type)) {
    const itemExpression = getInputTypeExpression(type.ofType, undefined, false);
    return `z.array(${itemExpression})`;
  }

  const namedType = getNamedType(type);

  if (isScalarType(namedType) || isEnumType(namedType) || isInputObjectType(namedType)) {
    return getNamedTypeExpression(namedType);
  }

  return "z.unknown()";
};

/**
 * Converts a GraphQL input type to an input-value expression.
 * @param type GraphQL input type.
 * @param defaultValue Optional default value for the input.
 * @param allowUndefined Whether the input should accept omitted/`undefined` values.
 * @returns TypeScript source expression for a single input value.
 */
const getInputTypeExpression = (
  type: GraphQLInputType,
  defaultValue?: unknown,
  allowUndefined = true,
): string => {
  const baseExpression = isNonNullType(type)
    ? getNonNullableInputTypeExpression(type.ofType)
    : `${getNonNullableInputTypeExpression(type)}.nullable()${allowUndefined ? ".optional()" : ""}`;

  if (defaultValue !== undefined) {
    return `${baseExpression}.default(${JSON.stringify(defaultValue)})`;
  }

  return baseExpression;
};

const getNonNullableInputTypeExpressionFromTypeNode = (
  schema: GraphQLSchema,
  typeNode: TypeNode,
): string => {
  if (typeNode.kind === Kind.NON_NULL_TYPE) {
    return getNonNullableInputTypeExpressionFromTypeNode(schema, typeNode.type);
  }

  if (typeNode.kind === Kind.LIST_TYPE) {
    const itemExpression = getInputTypeExpressionFromTypeNode(schema, typeNode.type, false);
    return `z.array(${itemExpression})`;
  }

  const namedType = schema.getType(typeNode.name.value);

  if (isScalarType(namedType) || isEnumType(namedType) || isInputObjectType(namedType)) {
    return getNamedTypeExpression(namedType);
  }

  return "z.unknown()";
};

const getInputTypeExpressionFromTypeNode = (
  schema: GraphQLSchema,
  typeNode: TypeNode,
  allowUndefined: boolean,
): string => {
  if (typeNode.kind === Kind.NON_NULL_TYPE) {
    return getNonNullableInputTypeExpressionFromTypeNode(schema, typeNode.type);
  }

  return `${getNonNullableInputTypeExpressionFromTypeNode(schema, typeNode)}.nullable()${allowUndefined ? ".optional()" : ""}`;
};

/**
 * Converts a GraphQL type AST node to a Zod expression string.
 * @param schema Executable GraphQL schema used to resolve named types.
 * @param typeNode GraphQL AST type node from operation variable definitions.
 * @param defaultValueNode Optional GraphQL default value AST for this input.
 * @returns TypeScript source expression for the variable type schema.
 */
export const getRawInputTypeExpressionFromTypeNode = (
  schema: GraphQLSchema,
  typeNode: TypeNode,
  defaultValueNode?: ValueNode,
): string => {
  const baseExpression = getInputTypeExpressionFromTypeNode(schema, typeNode, true);

  if (defaultValueNode) {
    const defaultValue = valueFromASTUntyped(defaultValueNode);
    return `${baseExpression}.default(${JSON.stringify(defaultValue)})`;
  }

  return baseExpression;
};

const getNonNullableOutputTypeExpression = (
  type: GraphQLOutputType,
  nestedObjectExpression?: string,
): string => {
  if (isNonNullType(type)) {
    return getNonNullableOutputTypeExpression(type.ofType, nestedObjectExpression);
  }

  if (isListType(type)) {
    const listItem = getOutputTypeExpression(type.ofType, nestedObjectExpression);
    return `z.array(${listItem})`;
  }

  const namedType = getNamedType(type);

  if (
    nestedObjectExpression &&
    (isObjectType(namedType) || isInterfaceType(namedType) || isUnionType(namedType))
  ) {
    return nestedObjectExpression;
  }

  if (isScalarType(namedType)) {
    return scalarToZod(namedType.name);
  }

  if (isEnumType(namedType)) {
    return getEnumSchemaIdentifier(namedType.name);
  }

  return "z.unknown()";
};

/**
 * Converts an output field type to a Zod expression, preserving nullability.
 * @param type GraphQL output type.
 * @param nestedObjectExpression Prebuilt nested object schema expression, when applicable.
 * @returns TypeScript source expression for the output field.
 */
const getOutputTypeExpression = (
  type: GraphQLOutputType,
  nestedObjectExpression?: string,
): string => {
  if (isNonNullType(type)) {
    return getNonNullableOutputTypeExpression(type.ofType, nestedObjectExpression);
  }

  return `${getNonNullableOutputTypeExpression(type, nestedObjectExpression)}.nullable()`;
};

type SelectionSchemaBuildResult = {
  schemaExpression: string;
  fragmentDependencies: Set<string>;
};

const addFragmentDependencies = (target: Set<string>, source: Set<string>): void => {
  for (const fragmentDependency of source) {
    target.add(fragmentDependency);
  }
};

const buildUnionSelectionSchema = (
  schema: GraphQLSchema,
  selectionSet: SelectionSetNode,
  parentType: GraphQLUnionType,
): SelectionSchemaBuildResult => {
  const possibleTypesByName = new Map(parentType.getTypes().map((type) => [type.name, type]));
  const variantExpressions: string[] = [];
  const fragmentDependencies = new Set<string>();
  let includesTypenameField = false;

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.name.value === "__typename") {
        includesTypenameField = true;
      }

      continue;
    }

    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragmentName = selection.name.value;
      fragmentDependencies.add(fragmentName);
      variantExpressions.push(getFragmentSchemaIdentifier(fragmentName));
      continue;
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      const inlineTypeName = selection.typeCondition?.name.value;

      if (!inlineTypeName) {
        for (const possibleType of possibleTypesByName.values()) {
          const nested = buildSelectionSchema(schema, selection.selectionSet, possibleType);
          variantExpressions.push(nested.schemaExpression);
          addFragmentDependencies(fragmentDependencies, nested.fragmentDependencies);
        }

        continue;
      }

      const inlineType = possibleTypesByName.get(inlineTypeName);
      if (!inlineType) {
        continue;
      }

      const nested = buildSelectionSchema(schema, selection.selectionSet, inlineType);
      variantExpressions.push(nested.schemaExpression);
      addFragmentDependencies(fragmentDependencies, nested.fragmentDependencies);
    }
  }

  if (includesTypenameField) {
    const typeLiterals = parentType
      .getTypes()
      .map((type) => `'${type.name}'`)
      .join(", ");
    variantExpressions.push(`z.object({\n  __typename: z.enum([${typeLiterals}]),\n})`);
  }

  const uniqueVariantExpressions = [...new Set(variantExpressions)];
  if (uniqueVariantExpressions.length === 0) {
    return {
      schemaExpression: "z.unknown()",
      fragmentDependencies,
    };
  }

  if (uniqueVariantExpressions.length === 1) {
    return {
      schemaExpression: uniqueVariantExpressions[0],
      fragmentDependencies,
    };
  }

  return {
    schemaExpression: `z.union([${uniqueVariantExpressions.join(", ")}])`,
    fragmentDependencies,
  };
};

/**
 * Builds a Zod object schema expression from a GraphQL selection set.
 * @param schema Executable GraphQL schema.
 * @param selectionSet GraphQL selection set to materialize as a schema.
 * @param parentType Parent output type for resolving selected fields.
 * @returns Object containing generated schema source and fragment dependencies.
 */
export const buildSelectionSchema = (
  schema: GraphQLSchema,
  selectionSet: SelectionSetNode,
  parentType: GraphQLObjectType | GraphQLInterfaceType,
): SelectionSchemaBuildResult => {
  const fieldsMap = parentType.getFields();
  const objectEntries: string[] = [];
  const extensions: string[] = [];
  const fragmentDependencies = new Set<string>();

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const fieldName = selection.name.value;
      const fieldDefinition = fieldsMap[fieldName];

      if (!fieldDefinition) {
        continue;
      }

      const outputName = selection.alias?.value ?? fieldName;
      const namedFieldType = getNamedType(fieldDefinition.type);
      let nestedSchemaExpression: string | undefined;

      if (
        selection.selectionSet &&
        (isObjectType(namedFieldType) || isInterfaceType(namedFieldType))
      ) {
        const nested = buildSelectionSchema(schema, selection.selectionSet, namedFieldType);
        nestedSchemaExpression = nested.schemaExpression;
        addFragmentDependencies(fragmentDependencies, nested.fragmentDependencies);
      } else if (selection.selectionSet && isUnionType(namedFieldType)) {
        const nested = buildUnionSelectionSchema(schema, selection.selectionSet, namedFieldType);
        nestedSchemaExpression = nested.schemaExpression;
        addFragmentDependencies(fragmentDependencies, nested.fragmentDependencies);
      }

      const rawExpression = getOutputTypeExpression(fieldDefinition.type, nestedSchemaExpression);

      objectEntries.push(`  ${outputName}: ${rawExpression},`);
      continue;
    }

    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragmentName = selection.name.value;
      fragmentDependencies.add(fragmentName);
      extensions.push(getFragmentSchemaIdentifier(fragmentName));
      continue;
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      const inlineTypeName = selection.typeCondition?.name.value;
      const inlineParentType = inlineTypeName ? schema.getType(inlineTypeName) : parentType;

      if (
        inlineParentType &&
        (isObjectType(inlineParentType) || isInterfaceType(inlineParentType))
      ) {
        const nested = buildSelectionSchema(schema, selection.selectionSet, inlineParentType);
        extensions.push(nested.schemaExpression);
        addFragmentDependencies(fragmentDependencies, nested.fragmentDependencies);
      }
    }
  }

  const uniqueExtensions = [...new Set(extensions)];
  const objectBody = objectEntries.length > 0 ? `\n${objectEntries.join("\n")}\n` : "";
  const baseSchemaExpression = `z.object({${objectBody}})`;
  let schemaExpression = baseSchemaExpression;

  if (uniqueExtensions.length > 0 && isInterfaceType(parentType)) {
    const interfaceVariants = [
      ...(objectEntries.length > 0 ? [baseSchemaExpression] : []),
      ...uniqueExtensions.map((extensionExpression) => {
        if (objectEntries.length === 0) {
          return extensionExpression;
        }

        return `z.intersection(${baseSchemaExpression}, ${extensionExpression})`;
      }),
    ];
    const uniqueInterfaceVariants = [...new Set(interfaceVariants)];
    schemaExpression =
      uniqueInterfaceVariants.length === 1
        ? uniqueInterfaceVariants[0]
        : `z.union([${uniqueInterfaceVariants.join(", ")}])`;
  } else {
    if (objectEntries.length === 0 && uniqueExtensions.length > 0) {
      schemaExpression = uniqueExtensions[0];

      for (const extensionExpression of uniqueExtensions.slice(1)) {
        schemaExpression = `z.intersection(${schemaExpression}, ${extensionExpression})`;
      }
    } else {
      for (const extensionExpression of uniqueExtensions) {
        schemaExpression = `z.intersection(${schemaExpression}, ${extensionExpression})`;
      }
    }
  }

  return {
    schemaExpression,
    fragmentDependencies,
  };
};
