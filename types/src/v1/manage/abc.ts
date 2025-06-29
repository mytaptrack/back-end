import { AbcCollection } from "../license";

export interface PutAbcCollectionRequest extends AbcCollection {
    oldName?: string;
}
