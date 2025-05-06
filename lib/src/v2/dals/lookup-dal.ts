import { TagMapping, BehaviorMapping } from '../types';
import { generate } from 'short-uuid';
import { DalBaseClass } from './dal';

interface TagStorage {
    pk: string;
    sk: string;
    pksk: string;
    type: string;
    shortId: string;
    license: string;
}

class LookupDalClass extends DalBaseClass {
    async getBehavior(license: string, behaviorName: string): Promise<BehaviorMapping> {
        const pk = `L#${license}#B`;
        const sk = `${behaviorName}`;
        const result = await this.primary.get<TagStorage>({ pk, sk }, 'shortId');
        let retval = result ? { behaviorName, shortId: result.shortId } : null;

        if (!retval) {
            retval = {
                behaviorName,
                shortId: generate()
            };
            try {
                await this.primary.put({
                        pk,
                        sk,
                        pksk: `${pk}#${sk}`,
                        type: 'customer behavior',
                        shortId: retval.shortId,
                        license
                    } as TagStorage, true);
            } catch (err) {
                if (err.message === 'The conditional request failed') {
                    const secondResult = await this.primary.get<TagStorage>({ pk, sk }, 'shortId');
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
