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

      expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);

      await send(cTokenRestrictions, 'removeUserFromWhiteList', [[minter]]);

      await preApprove(cToken, minter, mintAmount);
      await expect(quickMint(cToken, minter, mintAmount)).rejects.toRevert('revert NOT_IN_WHITELIST_ERROR');
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);
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
      expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(mintTokens).not.toEqualNumber(0);
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);
    });

    it("revert on exceed max mint amount", async () => {
      await preApprove(cToken, minter, mintAmount * 2);
      await expect(quickMint(cToken, minter, mintAmount * 2)).rejects.toRevert('revert MINT_AMOUNT_EXCEED_RESTRICTIONS');
      expect(await balanceOf(cToken, minter)).toEqualNumber(0);

      await preApprove(cToken, minter, mintAmount);
      expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);

      await preApprove(cToken, minter, mintAmount);
      await expect(quickMint(cToken, minter, mintAmount)).rejects.toRevert('revert MINT_AMOUNT_EXCEED_RESTRICTIONS');
    });
  });
});
