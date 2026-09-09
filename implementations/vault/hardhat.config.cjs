module.exports = {
  solidity: '0.8.28',
  networks: {
    hardhat: {
      chainId: 31373,
      hardfork: 'cancun',
      allowUnlimitedContractSize: false,
      blockGasLimit: 100000000,
    },
  },
};
