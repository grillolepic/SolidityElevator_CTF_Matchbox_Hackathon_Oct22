const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

describe("DRNG", function () {
  
  async function initialize() {
    const drngFactory = await ethers.getContractFactory("DRNG");
    const DRNG = await drngFactory.deploy();

    //console.log("");
    //console.log(`- DRNG deployed to ${DRNG.address}\n`);

    return { DRNG };
  }

  describe("Create Deterministic Random Numbers", function () {

    it("Should create deterministic random numbers", async function () {
        const { DRNG } = await loadFixture(initialize);
        let seed = await DRNG.seed(1000);
        //console.log(`First seed: (${seed[0].toString()}, ${seed[1].toString()})\n`);

        let result;
        for (let i=0; i<10; i++) {
            result = await DRNG.next(seed);
            //console.log(`Result: ${result.value.toString()} (${result.value.toHexString()})`);
            seed = result.nxt;
            //console.log(`Next: (${result.nxt[0].toString()}, ${result.nxt[1].toString()})\n`);
        }
        
      expect(result.value.toString()).to.equal("1005741347552150585");
    });

  });
});
