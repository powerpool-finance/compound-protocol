const {
  etherUnsigned,
  etherMantissa
} = require('../Utils/Ethereum');

const {
  makeCToken
} = require('../Utils/Compound');

const exchangeRate = 50e3;

async function priceOf(priceOracle, cToken) {
  return etherUnsigned(await call(priceOracle, 'getPrice', [cToken]));
}

async function makePriceOracle() {
  return deploy('AdministratedPriceOracle', []);
}

describe('AdministratedPriceOracle', function () {
  let root, minter, manager, newAdmin, anyone, accounts;
  let priceOracle;
  let cToken;
  let cToken2;
  let price = etherMantissa(0.8);

  beforeEach(async () => {
    [root, minter, manager, newAdmin, anyone, ...accounts] = saddle.accounts;
  });

  describe('manager interface', () => {
    beforeEach(async () => {
      cToken = await makeCToken({comptrollerOpts: {kind: 'bool'}, exchangeRate});
      cToken2 = await makeCToken({comptrollerOpts: {kind: 'bool'}, exchangeRate});
      priceOracle = await makePriceOracle({comptrollerOpts: {kind: 'bool'}, exchangeRate});
      await send(priceOracle, 'addManager', [manager]);
    });

    it("should set price successfully and reverts for not managers", async () => {
      expect(await priceOf(priceOracle, cToken2._address)).toEqualNumber(0);

      await expect(await send(priceOracle, 'setUnderlyingPrice', [cToken._address, price], {from: manager})).toSucceed();
      expect(await priceOf(priceOracle, cToken._address)).toEqualNumber(price);

      expect(await priceOf(priceOracle, cToken2._address)).toEqualNumber(0);

      await expect(send(priceOracle, 'setUnderlyingPrice', [cToken2._address, price], {from: anyone})).rejects.toRevert('revert Msg sender is not admin or manager');
      await expect(send(priceOracle, 'setDirectPrice', [cToken2._address, price], {from: anyone})).rejects.toRevert('revert Msg sender is not admin or manager');

      expect(await priceOf(priceOracle, cToken2._address)).toEqualNumber(0);
    });
  });

  describe('admin interface', () => {
    beforeEach(async () => {
      cToken = await makeCToken({comptrollerOpts: {kind: 'bool'}, exchangeRate});
      cToken2 = await makeCToken({comptrollerOpts: {kind: 'bool'}, exchangeRate});
      priceOracle = await makePriceOracle({comptrollerOpts: {kind: 'bool'}, exchangeRate});
    });

    it("should add and remove managers successfully", async () => {
      expect(await call(priceOracle, 'isManager', [manager])).toEqual(false);
      await expect(send(priceOracle, 'setUnderlyingPrice', [cToken2._address, price], {from: manager})).rejects.toRevert('revert Msg sender is not admin or manager');

      await send(priceOracle, 'addManager', [manager]);

      expect(await call(priceOracle, 'isManager', [manager])).toEqual(true);
      await expect(await send(priceOracle, 'setUnderlyingPrice', [cToken._address, price], {from: manager})).toSucceed();

      await send(priceOracle, 'removeManager', [manager]);
      await expect(send(priceOracle, 'setUnderlyingPrice', [cToken2._address, price], {from: manager})).rejects.toRevert('revert Msg sender is not admin or manager');
    });

    it("should change admin successfully", async () => {
      expect(await call(priceOracle, 'admin', [])).toEqual(root);
      await expect(send(priceOracle, '_setPendingAdmin', [newAdmin], {from: anyone})).rejects.toRevert('revert Msg sender is not admin');

      await expect(await send(priceOracle, '_setPendingAdmin', [newAdmin], {from: root})).toSucceed();
      expect(await call(priceOracle, 'admin', [])).toEqual(root);
      expect(await call(priceOracle, 'pendingAdmin', [])).toEqual(newAdmin);

      await expect(send(priceOracle, 'addManager', [manager], {from: newAdmin})).rejects.toRevert('revert Msg sender is not admin');
      await expect(send(priceOracle, 'addManager', [manager], {from: anyone})).rejects.toRevert('revert Msg sender is not admin');
      await expect(send(priceOracle, 'removeManager', [manager], {from: newAdmin})).rejects.toRevert('revert Msg sender is not admin');
      await expect(send(priceOracle, 'removeManager', [manager], {from: anyone})).rejects.toRevert('revert Msg sender is not admin');

      await expect(send(priceOracle, '_acceptAdmin', [], {from: anyone})).rejects.toRevert('revert Msg sender are not pendingAdmin');
      await expect(await send(priceOracle, '_acceptAdmin', [], {from: newAdmin})).toSucceed();

      expect(await call(priceOracle, 'admin', [])).toEqual(newAdmin);

      await expect(await send(priceOracle, 'addManager', [manager], {from: newAdmin})).toSucceed();
      expect(await call(priceOracle, 'isManager', [manager])).toEqual(true);
      await expect(await send(priceOracle, 'removeManager', [manager], {from: newAdmin})).toSucceed();
      expect(await call(priceOracle, 'isManager', [manager])).toEqual(false);
    });
  });
});
