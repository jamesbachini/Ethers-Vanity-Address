import { ethers } from 'ethers';

//const vanityAddresses = ['0x111','0x222','0x333','0x444','0x555','0x666','0x777','0x888','0x999']; // a-f 0-9
const vanityAddresses = ['0xdef1']; // a-f 0-9

vanityAddresses.forEach((v,i) => { vanityAddresses[i] = v.toLowerCase() });

const findMultipleAddresses = async () => {
  const randomWallet = ethers.Wallet.createRandom();
  vanityAddresses.forEach((vanityAddress) => {
    if (randomWallet.address.toLowerCase().includes(vanityAddress)) {
      console.log(`# ${randomWallet.address}`);
      console.log(randomWallet.address);
      console.log(randomWallet._mnemonic().phrase);
      console.log(randomWallet._signingKey().privateKey);
      console.log('-------------------------------');
    }
  });
}

const findSingleAddress = async () => {
  const randomWallet = ethers.Wallet.createRandom();
  if (randomWallet.address.toLowerCase().includes(vanityAddresses[0])) {
    console.log(`# ${randomWallet.address}`);
    console.log(randomWallet._mnemonic().phrase);
    console.log(randomWallet._signingKey().privateKey);
    console.log('-------------------------------');
  }
}

if (vanityAddresses.length > 1) {
  console.log(`Searching for ${vanityAddresses.length} addresses`);
  for (let i = 0; i < 1e12; i++) {
    findMultipleAddresses();
  }
} else {
  console.log(`Searching for single address ${vanityAddresses[0]}`);
  for (let i = 0; i < 1e12; i++) {
    findSingleAddress();
  }
}