const {makeCToken} = require('../Utils/Compound');

describe.only('PPGtDelegate Token', function () {
  let root, accounts;
  let alice, bob, charlie, treasury;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    [alice, bob, charlie, treasury] = accounts;
  });

  describe('initialization', () => {
    it.only('should correctly assign the initial variables', async () => {
      const cToken = await makeCToken({
        kind: 'ppgt',
        name: 'BZZ',
        votingAddressManager: bob,
        governorOpts: {cvpBeneficiary: alice, cvpOpts: {cvpBeneficiary: treasury}},
        voteCasterOpts: {cvpBeneficiary: alice, cvpOpts: {cvpBeneficiary: treasury}}
      });
      const {governor, voteCaster} = cToken;
      expect(await call(cToken, 'governorAlpha', [])).toEqual(governor._address);
      expect(await call(cToken, 'voteCaster', [])).toEqual(voteCaster._address);
      expect(await call(cToken, 'votingAddressManager', [])).toEqual(bob);
    });
  });

  describe('transfer', () => {
    it("cannot transfer from a zero balance", async () => {
      const cToken = await makeCToken({supportMarket: true});
      expect(await call(cToken, 'balanceOf', [root])).toEqualNumber(0);
      expect(await send(cToken, 'transfer', [accounts[0], 100])).toHaveTokenFailure('MATH_ERROR', 'TRANSFER_NOT_ENOUGH');
    });

    it("transfers 50 tokens", async () => {
      const cToken = await makeCToken({supportMarket: true});
      await send(cToken, 'harnessSetBalance', [root, 100]);
      expect(await call(cToken, 'balanceOf', [root])).toEqualNumber(100);
      await send(cToken, 'transfer', [accounts[0], 50]);
      expect(await call(cToken, 'balanceOf', [root])).toEqualNumber(50);
      expect(await call(cToken, 'balanceOf', [accounts[0]])).toEqualNumber(50);
    });

    it("doesn't transfer when src == dst", async () => {
      const cToken = await makeCToken({supportMarket: true});
      await send(cToken, 'harnessSetBalance', [root, 100]);
      expect(await call(cToken, 'balanceOf', [root])).toEqualNumber(100);
      expect(await send(cToken, 'transfer', [root, 50])).toHaveTokenFailure('BAD_INPUT', 'TRANSFER_NOT_ALLOWED');
    });

    it("rejects transfer when not allowed and reverts if not verified", async () => {
      const cToken = await makeCToken({comptrollerOpts: {kind: 'bool'}});
      await send(cToken, 'harnessSetBalance', [root, 100]);
      expect(await call(cToken, 'balanceOf', [root])).toEqualNumber(100);

      await send(cToken.comptroller, 'setTransferAllowed', [false])
      expect(await send(cToken, 'transfer', [root, 50])).toHaveTrollReject('TRANSFER_COMPTROLLER_REJECTION');

      await send(cToken.comptroller, 'setTransferAllowed', [true])
      await send(cToken.comptroller, 'setTransferVerify', [false])
      await expect(send(cToken, 'transfer', [accounts[0], 50])).rejects.toRevert("revert transferVerify rejected transfer");
    });
  });
});