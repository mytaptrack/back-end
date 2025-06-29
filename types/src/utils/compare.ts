
export function valuesMatch<T>(a: T, b: T) {
    if(!a && !b) {
        return true;
    }
    if(!a || !b) {
        return false;
    }
    if(typeof a != typeof b) {
        return false;
    }
    if(!a && !b && (a as any) != 0 && (b as any) != 0) {
        return true;
    }
    if(Array.isArray(a) && Array.isArray(b)) {
        return containsAll(a, b);
    } else if(typeof a == 'object') {
        const result = Object.keys(a).findIndex(key => !valuesMatch(a[key], b[key]));
        return result == -1;
    } else {
        return a == b;
    }
}

function containsAll<T>(a: T[], b: T[]) {
    if(!a && !b) {
        return true;
    }
    if(!a || !b) {
        return false;
    }

    if(a.length != b.length) {
        return false;
    }
    const retval = a.map(itemA => b.find(itemB =>  valuesMatch(itemA, itemB)));

    return retval;
}
