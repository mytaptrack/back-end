import { Schema } from "jsonschema";
import { AbcCollection, AbcCollectionSchema } from "../license";

export interface PutAbcCollectionRequest extends AbcCollection {
    oldName?: string;
}
export const PutAbcCollectionRequestSchema: Schema = {
    type: 'object',
    properties: {
        ...AbcCollectionSchema.properties,
        oldName: { type: 'string' }
    }
}
