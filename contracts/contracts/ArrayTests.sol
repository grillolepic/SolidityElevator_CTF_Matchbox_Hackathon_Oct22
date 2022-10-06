// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract ArrayTests {

    struct StructWithArrays {
        uint256 a;
        uint256[] b;
    }

    uint256[] private numberArray;
    StructWithArrays private simpleStruct;
    StructWithArrays[] private structArray;
    mapping(uint256 => StructWithArrays) private directMapping;
    mapping(uint256 => StructWithArrays[]) private arrayMapping;

    function getAllVariables(uint256 id) external view returns (uint256[] memory, StructWithArrays memory, StructWithArrays[] memory, StructWithArrays memory, StructWithArrays[] memory) {
        return (numberArray, simpleStruct, structArray, directMapping[id], arrayMapping[id]);
    }

    function pushToNumberArray(uint256 n) external {
        numberArray.push(n);
    }
    function replaceNumberArray(uint256[] memory a) external {
        numberArray = a;
    }

    function pushToSimpleStruct(uint256 n) external {
        simpleStruct.b.push(n);
    }
    function replaceSimpleStruct(uint256[] memory a) external {
        simpleStruct.b = a;
    }

    function pushToStructArray(StructWithArrays memory n) external {
        structArray.push(n);
    }
    function replaceInStructStruct(uint256 id, uint256[] memory a) external {
        structArray[id].b = a;
    }
}