import { ethers } from 'ethers';

const vanityAddress = '0xdef1'; // a-f 0-9

const vantiyLC = vanityAddress.toLowerCase();

const createAddress = () => {
  const randomWallet = ethers.Wallet.createRandom();
  if (randomWallet.address.toLowerCase().includes(vantiyLC)) {
    console.log(randomWallet.address);
    console.log(randomWallet._mnemonic().phrase);
    console.log(randomWallet._signingKey().privateKey);
  }
}

for (let i = 0; i < 1e12; i++) {
  createAddress();
}
