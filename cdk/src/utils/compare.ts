
export function containsAll(a: any[], b: any[]) {
    if (a.length != b.length) {
        return false;
    }
    const result = a.find(ai => !b.find(bi => ai == bi));

    return result ? false : true;
}