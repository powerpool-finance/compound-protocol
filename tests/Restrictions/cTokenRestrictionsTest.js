const {
  etherUnsigned,
  etherMantissa
} = require('../Utils/Ethereum');

const {
  makeCToken,
  balanceOf,
  preApprove,
  quickMint
} = require('../Utils/Compound');

const exchangeRate = 50e3;
const mintAmount = etherUnsigned(10e4);
const mintTokens = mintAmount.div(exchangeRate);

async function preMint(cToken, minter, mintAmount, mintTokens, exchangeRate) {
  await preApprove(cToken, minter, mintAmount);
  await send(cToken.comptroller, 'setMintAllowed', [true]);
  await send(cToken.comptroller, 'setMintVerify', [true]);
  await send(cToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(cToken.underlying, 'harnessSetFailTransferFromAddress', [minter, false]);
  await send(cToken, 'harnessSetBalance', [minter, 0]);
  await send(cToken, 'harnessSetExchangeRate', [etherMantissa(exchangeRate)]);
}

async function borrow(cToken, borrower, borrowAmount, opts = {}) {
  // make sure to have a block delta so we accrue interest
  await send(cToken, 'harnessFastForward', [1]);
  return send(cToken, 'borrow', [borrowAmount], {from: borrower});
}

async function makeCTokenRestrictions(cTokens = [], maxMintList = [], maxBorrowList = []) {
  let cTokenRestrictions = await deploy('CTokenRestrictions', []);
  await send(cTokenRestrictions, 'setDefaultRestrictions', [cTokens, maxMintList, maxBorrowList]);
  return cTokenRestrictions;
}

describe('CTokenRestrictions', function () {
  let root, minter, redeemer, accounts;
  let cToken;
  let cTokenRestrictions;
  let maxMint = mintAmount;
  let maxBorrow = mintAmount / 2;

  beforeEach(async () => {
    [root, minter, redeemer, ...accounts] = saddle.accounts;
  });

  describe('whitelist', () => {
    beforeEach(async () => {
      cToken = await makeCToken({comptrollerOpts: {kind: 'bool'}, exchangeRate});
      cTokenRestrictions = await makeCTokenRestrictions([cToken._address], [maxMint], [maxBorrow]);
      await send(cToken, '_setTokenRestrictions', [cTokenRestrictions._address]);
      await preMint(cToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("should revert for not whitelisted users", async () => {
      await expect(quickMint(cToken, minter, mintAmount)).rejects.toRevert('revert NOT_IN_WHITELIST_ERROR');
      expect(await balanceOf(cToken, minter)).toEqualNumber(0);

      await send(cTokenRestrictions, 'addUserToWhiteList', [[minter], [], [], []]);

      await expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);

      await send(cTokenRestrictions, 'removeUserFromWhiteList', [[minter]]);

      await preApprove(cToken, minter, mintAmount);
      await expect(quickMint(cToken, minter, mintAmount)).rejects.toRevert('revert NOT_IN_WHITELIST_ERROR');
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);

      await send(cTokenRestrictions, 'setWhitelistDisabled', [true]);

      await expect(quickMint(cToken, minter, mintAmount)).rejects.toRevert('revert MINT_AMOUNT_EXCEED_RESTRICTIONS');

      await send(cTokenRestrictions, 'setDefaultRestrictions', [[cToken._address], [maxMint.mul(2)], [maxBorrow]]);

      await quickMint(cToken, minter, mintAmount);
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens.mul(2));
    });
  });

  describe('mint', () => {
    beforeEach(async () => {
      cToken = await makeCToken({comptrollerOpts: {kind: 'bool'}, exchangeRate});
      cTokenRestrictions = await makeCTokenRestrictions([cToken._address], [maxMint], [maxBorrow]);
      await send(cToken, '_setTokenRestrictions', [cTokenRestrictions._address]);
      await preMint(cToken, minter, mintAmount, mintTokens, exchangeRate);
      await send(cTokenRestrictions, 'addUserToWhiteList', [[minter], [], [], []]);
    });

    it("returns success from mintFresh and mints the correct number of tokens", async () => {
      await expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(mintTokens).not.toEqualNumber(0);
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);
    });

    it("revert on exceed max mint amount", async () => {
      await preApprove(cToken, minter, mintAmount * 2);
      await expect(quickMint(cToken, minter, mintAmount * 2)).rejects.toRevert('revert MINT_AMOUNT_EXCEED_RESTRICTIONS');
      expect(await balanceOf(cToken, minter)).toEqualNumber(0);

      await preApprove(cToken, minter, mintAmount);
      await expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);

      await preApprove(cToken, minter, mintAmount);
      await expect(quickMint(cToken, minter, mintAmount)).rejects.toRevert('revert MINT_AMOUNT_EXCEED_RESTRICTIONS');
    });
  });

  describe('borrow', () => {
    beforeEach(async () => {
      cToken = await makeCToken({comptrollerOpts: {kind: 'bool'}, exchangeRate});
      cTokenRestrictions = await makeCTokenRestrictions([cToken._address], [maxMint], [maxBorrow]);
      await send(cToken, '_setTokenRestrictions', [cTokenRestrictions._address]);
      await preMint(cToken, minter, mintAmount, mintTokens, exchangeRate);
      await send(cTokenRestrictions, 'addUserToWhiteList', [[minter], [], [], []]);

      await send(cToken.comptroller, 'setBorrowAllowed', [true]);
      await send(cToken.comptroller, 'setBorrowVerify', [true]);
      await send(cToken.comptroller, 'enterMarkets', [[cTokenRestrictions._address]]);
    });
    it("revert on exceed max borrow amount", async () => {
      await preApprove(cToken, minter, mintAmount);
      expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);

      await expect(borrow(cToken, minter, mintAmount / 2 + 1)).rejects.toRevert('revert BORROW_AMOUNT_EXCEED_RESTRICTIONS');
      await expect(await borrow(cToken, minter, mintAmount / 2)).toSucceed();
      await expect(borrow(cToken, minter, mintAmount / 4)).rejects.toRevert('revert BORROW_AMOUNT_EXCEED_RESTRICTIONS');

      await preApprove(cToken, minter, mintAmount);
      await send(cToken, 'repayBorrow', [mintAmount / 2], {from: minter});

      expect(await borrow(cToken, minter, mintAmount / 4)).toSucceed();
    });
  });
});
