import { TagMapping, BehaviorMapping } from '../types';
import { generate } from 'short-uuid';
import { DalBaseClass } from './dal';
import { IDataAccessLayer, DatabaseKey } from '../types/database-abstraction';

interface TagStorage {
    pk: string;
    sk: string;
    pksk: string;
    type: string;
    shortId: string;
    license: string;
}

class LookupDalClass extends DalBaseClass {
    /**
     * Get behavior mapping using abstraction layer when available
     */
    async getBehavior(license: string, behaviorName: string): Promise<BehaviorMapping> {
        const pk = `L#${license}#B`;
        const sk = `${behaviorName}`;
        
        // Use abstraction layer if available, otherwise fall back to legacy DAL
        let result: TagStorage | null = null;
        
        if (this.isAbstractionEnabled()) {
            const provider = this.getAbstractionProvider()!;
            const key: DatabaseKey = { primary: pk, sort: sk };
            result = await provider.get<TagStorage>(key, { projection: ['shortId'] });
        } else {
            result = await this.primary.get<TagStorage>({ pk, sk }, 'shortId');
        }
        
        let retval = result ? { behaviorName, shortId: result.shortId } : null;

        if (!retval) {
            retval = {
                behaviorName,
                shortId: generate()
            };
            try {
                const tagData: TagStorage = {
                    pk,
                    sk,
                    pksk: `${pk}#${sk}`,
                    type: 'customer behavior',
                    shortId: retval.shortId,
                    license
                };

                if (this.isAbstractionEnabled()) {
                    const provider = this.getAbstractionProvider()!;
                    await provider.put(tagData, { ensureNotExists: true });
                } else {
                    await this.primary.put(tagData, true);
                }
            } catch (err) {
                if (err.message === 'The conditional request failed') {
                    let secondResult: TagStorage | null = null;
                    
                    if (this.isAbstractionEnabled()) {
                        const provider = this.getAbstractionProvider()!;
                        const key: DatabaseKey = { primary: pk, sort: sk };
                        secondResult = await provider.get<TagStorage>(key, { projection: ['shortId'] });
                    } else {
                        secondResult = await this.primary.get<TagStorage>({ pk, sk }, 'shortId');
                    }
                    
                    retval = secondResult ? { behaviorName, shortId: secondResult.shortId } : null;
                }
                if (!retval) {
                    throw err;
                }
            }
        }
        return retval;
    }

    async getTagsFromShortIds(license: string, shortIds: string[]): Promise<TagMapping[]> {
        const results = await this.primary.query<TagStorage>({
            keyExpression: 'pk = :pk',
            attributeValues: {
                ':pk': `L#${license}#T`,
                ':shortId': shortIds
            },
            filterExpression: 'contains(:shortId, shortId)',
            projectionExpression: 'sk,shortId'
        });

        return results.map(x => ({ tag: x.sk, shortId: x.shortId}));
    }

    async getTag(license: string, tag: string): Promise<TagMapping> {
        const pk = `L#${license}#T`;
        const sk = tag;
        const result = await this.primary.get<TagStorage>({ pk, sk} );
        let retval = result? { tag, shortId: result.shortId } : null;

        if (!retval) {
            retval = {
                tag,
                shortId: generate()
            };
            try {
                await this.primary.put({
                        pk,
                        sk,
                        pksk: `${pk}#${sk}`,
                        type: 'customer tag',
                        shortId: retval.shortId,
                        license
                    } as TagStorage, true);
            } catch (err) {
                if (err.message === 'The conditional request failed') {
                    const secondResult = await this.primary.get<TagStorage>({ pk, sk }, 'shortId');
                    retval = secondResult ? { tag, shortId: secondResult.shortId } : null;
                }
                if (!retval) {
                    throw err;
                }
            }
        }
        return retval;
    }
}

export const LookupDal = new LookupDalClass();
