// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// @title Deterministic Randomn Number Generator from Seed
/// @author grillolepic <TW: @grillo_eth>
/// @dev Note: Algorithm: xoroshiro128+
/// @dev Note: Based on: https://xorshift.di.unimi.it/xoroshiro128plus.c
/// @dev Note: And: https://prng.di.unimi.it/splitmix64.c
/// @dev Note: Not gas-optimized. Meant for off-chain use.

library DRNG {
    function seed(uint64 s) external pure returns (uint64[2] memory) {
        unchecked {
            uint64 s0 = splitmix64(s);
            uint64 s1 = splitmix64(s0);
            return [s0, s1];
        }
    }

    function next(uint64[2] memory previous) external pure returns (uint64 value, uint64[2] memory nxt) {
        unchecked {
            uint64 result = previous[0] + previous[1];
            uint64 tmp_s1 = previous[0] ^ previous[1];

            uint64 new_s0 = rotl(previous[0], 24) ^ tmp_s1 ^ (tmp_s1 << 16);
            uint64 new_s1 = rotl(tmp_s1, 37);

            return (result, [new_s0, new_s1]);
        }
    }

    function splitmix64(uint64 x) private pure returns (uint64) {
        unchecked {
            uint64 z = (x += 0x9e3779b97f4a7c15);
            z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9;
            z = (z ^ (z >> 27)) * 0x94d049bb133111eb;
            return (z ^ (z >> 31));
        }
    }

    function rotl(uint64 x, uint64 k) private pure returns (uint64) {
        unchecked {
            return (x << k) | (x >> (64 - k));
        }
    }
}
