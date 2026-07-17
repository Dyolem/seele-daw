/** Produces the union of an object's property value types. */
export type ValueOf<ObjectType> = ObjectType extends object ? ObjectType[keyof ObjectType] : never
