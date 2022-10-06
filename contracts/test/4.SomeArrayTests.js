const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SomeArrayTests", function () {
  
  async function initialize() {
    const atFactory = await ethers.getContractFactory("ArrayTests");
    const AT = await atFactory.deploy();
    return { AT };
  }

    it("Should populate and replace a simple uint storage Array", async function () {
        const { AT } = await loadFixture(initialize);
        
        await AT.pushToNumberArray(10);
        await AT.pushToNumberArray(50);
        await AT.pushToNumberArray(33);
        let currentState = (await AT.getAllVariables(0))[0];

        await AT.replaceNumberArray([99,11]);
        currentState = (await AT.getAllVariables(0))[0];

        expect(currentState.length).to.eq(2);
      });

    it("Should populate and replace an Array inside a Struct", async function () {
      const { AT } = await loadFixture(initialize);
      
      await AT.pushToSimpleStruct(10);
      await AT.pushToSimpleStruct(50);
      await AT.pushToSimpleStruct(33);
      let currentState = (await AT.getAllVariables(0))[1];

      await AT.replaceSimpleStruct([99,11]);
      currentState = (await AT.getAllVariables(0))[1];

      expect(currentState.b.length).to.eq(2);
    });

    it("Should populate and replace an Array inside a Struct Array", async function () {
      const { AT } = await loadFixture(initialize);
      
      await AT.pushToStructArray({a:10, b:[10,50,33]});
      let currentState = (await AT.getAllVariables(0))[2][0];

      await AT.replaceInStructStruct(0,[99,11]);
      currentState = (await AT.getAllVariables(0))[2][0];

      expect(currentState.b.length).to.eq(2);
    });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}