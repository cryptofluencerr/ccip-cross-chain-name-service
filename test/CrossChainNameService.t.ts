import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";

// Describe the test suite for the CrossChainNameService contracts.
describe("CrossChainNameService", function () {
  // Define a constant for the gas limit used in cross-chain calls.
  const GAS_LIMIT = 10000000; // 1 million gas limit

  // Define a constant for the Domain Name Service (DNS) to be registered.
  const DNS = "alice.ccns";

  // Deploy function to set up the required contracts and configurations before running tests.
  async function deploy() {
    // Retrieve the deployer and alice accounts.
    const [deployer, alice] = await ethers.getSigners();

    // Get the contract factory for the CCIPLocalSimulator and deploy it.
    const localSimulatorFactory = await ethers.getContractFactory(
      "CCIPLocalSimulator"
    );
    const localSimulator = await localSimulatorFactory.deploy();

    // Retrieve configuration details from the deployed local simulator contract.
    const config: {
      chainSelector_: bigint;
      sourceRouter_: string;
      destinationRouter_: string;
      wrappedNative_: string;
      linkToken_: string;
      ccipBnM_: string;
      ccipLnM_: string;
    } = await localSimulator.configuration();

    // Deploy CrossChainNameServiceLookup contracts for source and destination chains.
    const CrossChainNameServiceLookupFactory = await ethers.getContractFactory(
      "CrossChainNameServiceLookup"
    );
    const CrossChainNameServiceLookupSource =
      await CrossChainNameServiceLookupFactory.connect(deployer).deploy();
    const CrossChainNameServiceLookupDestination =
      await CrossChainNameServiceLookupFactory.connect(deployer).deploy();

    // Deploy CrossChainNameServiceRegister contracts for source and destination chains.
    const CrossChainNameServiceRegisterFactory =
      await ethers.getContractFactory("CrossChainNameServiceRegister");
    const CrossChainNameServiceRegisterSource =
      await CrossChainNameServiceRegisterFactory.connect(deployer).deploy(
        config.sourceRouter_,
        CrossChainNameServiceLookupSource.target
      );
    const CrossChainNameServiceRegisterDestination =
      await CrossChainNameServiceRegisterFactory.connect(deployer).deploy(
        config.destinationRouter_,
        CrossChainNameServiceLookupDestination.target
      );

    // Deploy the CrossChainNameServiceReceiver contract.
    const CrossChainNameServiceReceiverFactory =
      await ethers.getContractFactory("CrossChainNameServiceReceiver");
    const CrossChainNameServiceReceiver =
      await CrossChainNameServiceReceiverFactory.connect(deployer).deploy(
        config.sourceRouter_,
        CrossChainNameServiceLookupDestination.target,
        config.chainSelector_
      );

    // Return all deployed contracts and other relevant objects.
    return {
      localSimulator,
      CrossChainNameServiceLookupSource,
      CrossChainNameServiceLookupDestination,
      CrossChainNameServiceRegisterSource,
      CrossChainNameServiceRegisterDestination,
      CrossChainNameServiceReceiver,
      config,
      deployer,
      alice,
    };
  }

  // Test case to ensure the cross-chain name service works as expected.
  it("Should register & lookup for cross-chain name service", async () => {
    // Load the fixture to deploy contracts and set up the testing environment.
    const {
      localSimulator,
      CrossChainNameServiceLookupSource,
      CrossChainNameServiceLookupDestination,
      CrossChainNameServiceRegisterSource,
      CrossChainNameServiceRegisterDestination,
      CrossChainNameServiceReceiver,
      config,
      deployer,
      alice,
    } = await loadFixture(deploy);

    // Set the CrossChainNameServiceRegister address in the Lookup contracts for source and destination.
    await CrossChainNameServiceLookupSource.connect(
      deployer
    ).setCrossChainNameServiceAddress(
      CrossChainNameServiceRegisterSource.target
    );

    await CrossChainNameServiceLookupDestination.connect(
      deployer
    ).setCrossChainNameServiceAddress(CrossChainNameServiceReceiver.target);

    // Enable the CrossChainNameServiceRegister contract for the source chain with the specified gas limit.
    await CrossChainNameServiceRegisterSource.connect(deployer).enableChain(
      config.chainSelector_,
      CrossChainNameServiceReceiver.target,
      GAS_LIMIT
    );

    // Try to register the DNS name on the source chain using Alice's account.
    try {
      await CrossChainNameServiceRegisterSource.connect(alice).register(DNS);
    } catch (error) {
      console.error("Register failed: ", error);
    }

    // Lookup the registered DNS name on the destination chain.
    const registeredAddress =
      await CrossChainNameServiceLookupDestination.lookup(DNS);

    // Validate that the DNS name is correctly registered to Alice's address.
    expect(registeredAddress).to.equal(alice.address);
  });
});
