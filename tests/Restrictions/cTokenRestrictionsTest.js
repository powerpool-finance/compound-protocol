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
  let root, minter, redeemer, newAdmin, anyone, accounts;
  let cToken;
  let cTokenRestrictions;
  let maxMint = mintAmount;
  let maxBorrow = mintAmount / 2;

  beforeEach(async () => {
    [root, minter, redeemer, newAdmin, anyone, ...accounts] = saddle.accounts;
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

      await send(cTokenRestrictions, 'setDefaultRestrictions', [[cToken._address], ['0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'], [maxBorrow]]);

      await expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens.mul(2));

      await send(cTokenRestrictions, 'setDefaultRestrictions', [[cToken._address], [maxMint], [maxBorrow]]);

      await expect(quickMint(cToken, minter, mintAmount)).rejects.toRevert('revert MINT_AMOUNT_EXCEED_RESTRICTIONS');

      await send(cTokenRestrictions, 'updateUserRestrictions', [[minter], [cToken._address], ['0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'], [maxBorrow]]);

      await expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens.mul(3));
    });

    it("revert on exceed max total supply", async () => {
      await send(cTokenRestrictions, 'setDefaultRestrictions', [[cToken._address], [maxMint.mul(3)], [maxBorrow]]);
      await send(cTokenRestrictions, 'setTotalRestrictions', [[cToken._address], [maxMint]]);

      await preApprove(cToken, minter, mintAmount * 2);
      await expect(quickMint(cToken, minter, mintAmount * 2)).rejects.toRevert('revert TOTAL_SUPPLY_EXCEED_RESTRICTIONS');
      expect(await balanceOf(cToken, minter)).toEqualNumber(0);

      await preApprove(cToken, minter, mintAmount);
      await expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);

      await preApprove(cToken, minter, mintAmount);
      await expect(quickMint(cToken, minter, mintAmount)).rejects.toRevert('revert TOTAL_SUPPLY_EXCEED_RESTRICTIONS');

      await send(cTokenRestrictions, 'setTotalRestrictions', [[cToken._address], [maxMint.mul(2)]]);

      await expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens.mul(2));
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

    it("revert on exceed max borrow amount, allows to remove borrow limit", async () => {
      await preApprove(cToken, minter, mintAmount);
      expect(await quickMint(cToken, minter, mintAmount)).toSucceed();
      expect(await balanceOf(cToken, minter)).toEqualNumber(mintTokens);

      await expect(borrow(cToken, minter, mintAmount / 2 + 1)).rejects.toRevert('revert BORROW_AMOUNT_EXCEED_RESTRICTIONS');
      await expect(await borrow(cToken, minter, mintAmount / 2)).toSucceed();
      await expect(borrow(cToken, minter, mintAmount / 4)).rejects.toRevert('revert BORROW_AMOUNT_EXCEED_RESTRICTIONS');

      await send(cTokenRestrictions, 'setDefaultRestrictions', [[cToken._address], [maxMint], ['0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff']]);
      await expect(await borrow(cToken, minter, mintAmount / 4)).toSucceed();
    });

    it("should change admin successfully", async () => {
      expect(await call(cTokenRestrictions, 'admin', [])).toEqual(root);
      await expect(send(cTokenRestrictions, '_setPendingAdmin', [newAdmin], {from: anyone})).rejects.toRevert('revert Msg sender are not admin');

      await expect(await send(cTokenRestrictions, '_setPendingAdmin', [newAdmin], {from: root})).toSucceed();
      expect(await call(cTokenRestrictions, 'admin', [])).toEqual(root);
      expect(await call(cTokenRestrictions, 'pendingAdmin', [])).toEqual(newAdmin);

      await expect(send(cTokenRestrictions, '_acceptAdmin', [], {from: anyone})).rejects.toRevert('revert Msg sender are not pendingAdmin');
      await expect(await send(cTokenRestrictions, '_acceptAdmin', [], {from: newAdmin})).toSucceed();

      expect(await call(cTokenRestrictions, 'admin', [])).toEqual(newAdmin);
    });
  });
});
