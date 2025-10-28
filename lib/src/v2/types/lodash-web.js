"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clone = void 0;
exports.isEqual = isEqual;
exports.merge = merge;
exports.cloneDeep = cloneDeep;
function isEqual(a, b) {
    if (a == b) {
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!isEqual(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }
    if (typeof a === 'object' && typeof b === 'object') {
        if (Object.keys(a).length !== Object.keys(b).length) {
            return false;
        }
        if (Object.keys(a).length === 0) {
            return false;
        }
        const differences = Object.keys(a).filter(key => {
            if (!isEqual(a[key], b[key])) {
                return true;
            }
            return false;
        });
        return differences.length === 0;
    }
}
function merge(to, from) {
    if (!from) {
        return to;
    }
    if (!to) {
        return from;
    }
    if (Array.isArray(to) && Array.isArray(from)) {
        from.forEach(item => {
            if (!to.find(x => x === item)) {
                to.push(item);
            }
        });
        return to;
    }
    if (typeof to === 'object' && typeof from === 'object') {
        Object.keys(from).forEach(key => {
            to[key] = merge(to[key], from[key]);
        });
        return to;
    }
    return to;
}
function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
}
exports.clone = cloneDeep;
//# sourceMappingURL=lodash-web.js.map