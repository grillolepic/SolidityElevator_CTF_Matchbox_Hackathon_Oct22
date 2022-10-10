class DRNG {
    static seed(s) {
        let s0 = DRNG.#splitMix64(s);
        let s1 = DRNG.#splitMix64(s0);
        return [s0, s1];
    }

    static #splitMix64(x) {
        let z = BigInt.asUintN(64, BigInt(x) + BigInt("0x9e3779b97f4a7c15"));
        z = BigInt.asUintN(64,(z ^ (z >> BigInt(30))) * BigInt("0xbf58476d1ce4e5b9"));
        z = BigInt.asUintN(64, (z ^ (z >> BigInt(27))) * BigInt("0x94d049bb133111eb"));
        return BigInt.asUintN(64, z ^ (z >> BigInt(31)));
    }

    static #rotl(x, k) { return BigInt.asUintN(64, ((x << k) | (x >> (64n - k)))); }

    static next(seed) {
        seed[0] = BigInt(seed[0]);
        seed[1] = BigInt(seed[1]);

        let result = BigInt.asUintN(64, seed[0] + seed[1]);
        let tmp_s1 = BigInt.asUintN(64, seed[0] ^ seed[1]);

        let new_s0 = BigInt.asUintN(64, DRNG.#rotl(seed[0], 24n) ^ tmp_s1 ^ (tmp_s1 << 16n));
        let new_s1 = BigInt.asUintN(64, DRNG.#rotl(tmp_s1, 37n));

        let nextSeed = [new_s0, new_s1];
        return { result, nextSeed };
    }
}

export { DRNG }